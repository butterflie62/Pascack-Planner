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
        findCourse,
        creditTotals
    };
})();
