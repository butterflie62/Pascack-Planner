(() => {
    const STORAGE_KEY = "pascack-planner-student-v1";
    const grades = ["9", "10", "11", "12"];
    const requirementLabels = {
        english: "English",
        physicalEducation: "Physical Education & Health",
        mathematics: "Mathematics",
        science: "Science",
        socialStudies: "Social Studies",
        worldLanguages: "World Language",
        arts: "Visual or Performing Arts",
        lifeCareers: "21st Century Life & Careers",
        financialLiteracy: "Financial Literacy",
        electives: "Other electives"
    };
    const requirementTargets = {
        english: 20,
        physicalEducation: 20,
        mathematics: 15,
        science: 15,
        socialStudies: 15,
        worldLanguages: 10,
        arts: 5,
        lifeCareers: 5,
        financialLiteracy: 2.5,
        electives: 12.5
    };

    function createState() {
        return {
            profile: { graduationYear: "", currentGrade: "9", math8Course: "", math8Grade: "" },
            classes: {},
            maps: {},
            schedule: {}
        };
    }

    function isRecord(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function validateState(parsed) {
        if (!isRecord(parsed) || !isRecord(parsed.profile) || !isRecord(parsed.classes) ||
            !isRecord(parsed.maps) || !isRecord(parsed.schedule)) {
            throw new Error("Saved student data has an unexpected format.");
        }
        const validGrades = new Set(grades);
        for (const [key, course] of Object.entries(parsed.classes)) {
            if (!isRecord(course) || typeof course.title !== "string" ||
                typeof course.subjectId !== "string" || !validGrades.has(String(course.grade)) ||
                !["planned", "current", "completed"].includes(course.status) ||
                !Number.isFinite(Number(course.credits))) {
                throw new Error("A saved class has an unexpected format. Review the student plan data.");
            }
            if (course.key && course.key !== key) {
                throw new Error("A saved class identifier does not match its course record.");
            }
        }
        for (const [grade, departments] of Object.entries(parsed.maps)) {
            if (!validGrades.has(grade) || !isRecord(departments)) {
                throw new Error("A saved road map has an unexpected format.");
            }
            for (const keys of Object.values(departments)) {
                if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
                    throw new Error("A saved road-map department has an unexpected format.");
                }
            }
        }
        for (const [grade, schedule] of Object.entries(parsed.schedule)) {
            if (!validGrades.has(grade) || !isRecord(schedule) ||
                Object.entries(schedule).some(([slot, key]) =>
                    !/^[1-8]-(monday|tuesday|wednesday|thursday|friday)$/.test(slot) ||
                    typeof key !== "string" || !parsed.classes[key]
                )) {
                throw new Error("A saved schedule has an unexpected format.");
            }
        }
        const profile = parsed.profile;
        if (profile.currentGrade !== undefined && !validGrades.has(String(profile.currentGrade))) {
            throw new Error("The saved current grade is invalid.");
        }
        if (profile.planningGrade !== undefined && !validGrades.has(String(profile.planningGrade))) {
            throw new Error("The saved planning grade is invalid.");
        }
        for (const field of ["graduationYear", "math8Course", "math8Grade"]) {
            if (profile[field] !== undefined && typeof profile[field] !== "string") {
                throw new Error(`The saved ${field} value is invalid.`);
            }
        }
    }

    function load() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return createState();
        const parsed = JSON.parse(saved);
        validateState(parsed);
        return {
            profile: { ...createState().profile, ...parsed.profile },
            classes: parsed.classes,
            maps: parsed.maps,
            schedule: parsed.schedule
        };
    }

    function save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (error) {
            throw new Error(`Could not save your student data: ${error.message}`);
        }
    }

    function courseKey(course, grade) {
        return `${course.subjectId}::${encodeURIComponent(course.title)}::${grade}`;
    }

    function catalogCourseId(course) {
        const programs = window.PASCACK_PROGRAMS || [];
        for (const program of programs) {
            if (program.id !== course.subjectId) continue;
            const index = program.courses.findIndex((entry) => entry.title === course.title);
            if (index >= 0) return `${program.id}:${index}`;
        }
        return "";
    }

    function requirementForCourse(subjectId, title) {
        const text = title.toLocaleLowerCase();
        if (subjectId === "english") return "english";
        if (subjectId === "social-studies") return "socialStudies";
        if (subjectId === "mathematics") return "mathematics";
        if (subjectId === "science") return "science";
        if (subjectId === "world-languages") return "worldLanguages";
        if (subjectId === "health-physical-education") {
            return /health/.test(text) ? "physicalEducation" : "physicalEducation";
        }
        if (subjectId === "art" || subjectId === "music") return "arts";
        if (subjectId === "business-education" && /financial literacy/.test(text)) return "financialLiteracy";
        if (["business-education", "family-consumer-sciences", "technology-education"].includes(subjectId)) {
            return "lifeCareers";
        }
        return "electives";
    }

    function schedulePlan() {
        const state = load();
        return {
            currentGrade: Number(state.profile.currentGrade || "9"),
            courses: Object.entries(state.classes).map(([key, course]) => ({
                id: key,
                key,
                grade: Number(course.grade),
                courseId: catalogCourseId(course),
                customTitle: catalogCourseId(course) ? "" : course.title,
                subjectId: course.subjectId,
                source: course.source === "transcript" ? "transcript" :
                    course.source === "manual" ? "manual" : "planned",
                status: course.status,
                mark: course.mark || "",
                credits: Number(course.credits) || 5,
                requirement: course.requirement || requirementForCourse(course.subjectId, course.title)
            }))
        };
    }

    function saveSchedulePlan(currentGrade, courses) {
        if (!grades.includes(String(currentGrade)) || !Array.isArray(courses)) {
            throw new Error("The schedule plan has an invalid grade or course list.");
        }
        const state = load();
        const nextClasses = {};
        const nextMaps = {};
        const programs = window.PASCACK_PROGRAMS || [];
        for (const row of courses) {
            const grade = String(row.grade);
            if (!grades.includes(grade)) continue;
            const [subjectIdFromId, indexText] = String(row.courseId || "").split(/:(.*)/s);
            const catalogCourse = programs
                .find((program) => program.id === subjectIdFromId)
                ?.courses[Number(indexText)];
            const subjectId = catalogCourse ? subjectIdFromId : row.subjectId || "other-programs";
            const program = programs.find((item) => item.id === subjectId);
            const title = catalogCourse?.title || String(row.customTitle || "").trim();
            if (!title) continue;
            const key = courseKey({ subjectId, title }, grade);
            const status = ["planned", "current", "completed"].includes(row.status)
                ? row.status
                : row.source === "transcript" ? "completed" : "planned";
            nextClasses[key] = {
                key,
                title,
                subjectId,
                subjectName: program?.name || "Custom course",
                grade,
                status,
                mark: typeof row.mark === "string" ? row.mark.slice(0, 12) : "",
                credits: Number.isFinite(Number(row.credits)) ? Number(row.credits) : 5,
                requirement: Object.hasOwn(requirementLabels, row.requirement)
                    ? row.requirement
                    : requirementForCourse(subjectId, title),
                source: row.source === "transcript" ? "transcript" :
                    row.source === "manual" ? "manual" : "planned"
            };
            if (status === "planned") {
                nextMaps[grade] ||= {};
                nextMaps[grade][subjectId] ||= [];
                nextMaps[grade][subjectId].push(key);
            }
        }

        state.profile.currentGrade = String(currentGrade);
        state.classes = nextClasses;
        state.maps = nextMaps;
        for (const [grade, schedule] of Object.entries(state.schedule)) {
            for (const [slot, key] of Object.entries(schedule)) {
                if (!nextClasses[key]) delete schedule[slot];
            }
            if (!Object.keys(schedule).length) delete state.schedule[grade];
        }
        save(state);
        return schedulePlan();
    }

    function addScheduleCourse(subjectId, title, grade, status = "planned") {
        const program = (window.PASCACK_PROGRAMS || []).find((item) => item.id === subjectId);
        const course = program?.courses.find((item) => item.title === title);
        if (!program || !course || !grades.includes(String(grade))) {
            throw new Error("That course could not be added to your plan.");
        }
        const state = load();
        const key = courseKey({ subjectId, title }, String(grade));
        if (!state.classes[key]) {
            state.classes[key] = {
                key,
                title,
                subjectId,
                subjectName: program.name,
                grade: String(grade),
                status: ["planned", "current", "completed"].includes(status) ? status : "planned",
                mark: "",
                credits: 5,
                requirement: requirementForCourse(subjectId, title)
            };
        }
        if (state.classes[key].status === "planned") {
            state.maps[grade] ||= {};
            state.maps[grade][subjectId] ||= [];
            if (!state.maps[grade][subjectId].includes(key)) state.maps[grade][subjectId].push(key);
        }
        save(state);
        return key;
    }

    function findCourse(subjectId, title) {
        const program = (window.PASCACK_PROGRAMS || []).find((item) => item.id === subjectId);
        return program?.courses.find((item) => item.title === title);
    }

    function creditTotals(state) {
        const totals = { earned: 0, planned: 0, requirements: {} };
        for (const id of Object.keys(requirementLabels)) totals.requirements[id] = { earned: 0, planned: 0 };
        for (const course of Object.values(state.classes)) {
            const credits = Number(course.credits) || 0;
            const bucket = course.status === "planned" ? "planned" : "earned";
            totals[bucket] += credits;
            if (course.requirement && totals.requirements[course.requirement]) {
                totals.requirements[course.requirement][bucket] += credits;
            }
        }
        return totals;
    }

    window.StudentPlanner = {
        STORAGE_KEY,
        grades,
        requirementLabels,
        requirementTargets,
        createState,
        load,
        save,
        courseKey,
        requirementForCourse,
        schedulePlan,
        saveSchedulePlan,
        addScheduleCourse,
        findCourse,
        creditTotals
    };
})();
