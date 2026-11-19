const gradePicker = document.querySelector("#roadmap-grade");
const departmentPicker = document.querySelector("#roadmap-department");
const courseList = document.querySelector("#department-course-list");
const recommendedList = document.querySelector("#recommended-course-list");
const recommendationIntro = document.querySelector("#recommendation-intro");
const currentCourses = document.querySelector("#current-grade-courses");
const currentTitle = document.querySelector("#current-classes-title");
const emptyGradeMessage = document.querySelector("#empty-grade-message");
const mapList = document.querySelector("#saved-map-list");
const feedback = document.querySelector("#roadmap-feedback");
const mathNote = document.querySelector("#roadmap-math-note");
let roadmapState;

function saveRoadmapState() {
    try {
        StudentPlanner.save(roadmapState);
        feedback.textContent = "Your plan is saved in this browser.";
        feedback.classList.remove("save-status-error");
        renderRoadmap();
    } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add("save-status-error");
    }
}

function normalizedText(value) {
    return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function offeredInGrade(course, grade) {
    return (course.grades || "").split(",").map((value) => value.trim()).includes(grade);
}

function courseKey(course, program, grade) {
    return StudentPlanner.courseKey({ ...course, subjectId: program.id }, grade);
}

function hasCourseInGrade(course, program, grade) {
    return Object.values(roadmapState.classes).some((item) =>
        item.subjectId === program.id && item.title === course.title && item.grade === grade
    );
}

function isInMap(key, grade, subjectId) {
    return (roadmapState.maps[grade]?.[subjectId] || []).includes(key);
}

function subjectsForPrerequisite(text) {
    const subjects = [
        { pattern: /english|language arts/, id: "english" },
        { pattern: /history|social studies/, id: "social-studies" },
        { pattern: /math|algebra|geometry/, id: "mathematics" },
        { pattern: /science|biology|chemistry|physics/, id: "science" },
        { pattern: /world language|spanish|french|italian|chinese/, id: "world-languages" },
        { pattern: /\bart\b|studio/, id: "art" }
    ];
    return subjects.filter((subject) => subject.pattern.test(text)).map((subject) => subject.id);
}

function matchingPriorClass(course, grade, priorClasses) {
    const prerequisite = normalizedText(course.prerequisite || "");
    if (!prerequisite) return null;
    const gradeReferences = [...prerequisite.matchAll(/\b(\d+)(?:st|nd|rd|th)\s*grade\b/g)];
    if (gradeReferences.length) {
        const matchingClasses = [];
        for (let index = 0; index < gradeReferences.length; index += 1) {
            const reference = gradeReferences[index];
            const end = gradeReferences[index + 1]?.index ?? prerequisite.length;
            const requirementText = prerequisite.slice(reference.index, end).split(";")[0];
            const requiredSubjects = subjectsForPrerequisite(requirementText);
            if (!requiredSubjects.length || Number(reference[1]) >= Number(grade)) return null;
            const matches = requiredSubjects.map((subjectId) =>
                priorClasses.find((prior) =>
                    prior.grade === reference[1] && prior.subjectId === subjectId
                )
            );
            if (matches.some((match) => !match)) return null;
            matchingClasses.push(...matches);
        }
        return matchingClasses[0];
    }

    if (/\band\b|,|;/.test(prerequisite)) return null;
    return priorClasses.find((prior) => {
        const title = normalizedText(prior.title);
        return title.length > 5 && prerequisite.includes(title);
    }) || null;
}

function commonStartingCourses(grade) {
    const commonCourses = {
        "9": [
            { subjectId: "english", match: /^english i\b/i },
            { subjectId: "social-studies", match: /^world history$/i },
            { subjectId: "science", match: /^biology$/i }
        ],
        "10": [
            { subjectId: "english", match: /^english ii\b/i },
            { subjectId: "social-studies", match: /^u\. s\. history i$/i },
            { subjectId: "science", match: /^chemistry$/i }
        ],
        "11": [
            { subjectId: "english", match: /^english iii\b/i },
            { subjectId: "social-studies", match: /^u\. s\. history ii$/i },
            { subjectId: "science", match: /^physics$/i }
        ],
        "12": [
            { subjectId: "english", match: /^english iv\b/i }
        ]
    };
    return (commonCourses[grade] || []).flatMap((rule) => {
        const program = window.PASCACK_PROGRAMS.find((item) => item.id === rule.subjectId);
        const course = program?.courses.find((item) =>
            rule.match.test(item.title) && offeredInGrade(item, grade)
        );
        return course ? [{ course, program, reason: "A common starting point for this grade" }] : [];
    }).filter(({ course, program }) => !hasCourseInGrade(course, program, grade));
}

function recommendationsForGrade(grade) {
    const priorClasses = Object.values(roadmapState.classes).filter((course) =>
        ["current", "completed"].includes(course.status) && Number(course.grade) < Number(grade)
    );
    const candidates = window.PASCACK_PROGRAMS.flatMap((program) =>
        program.courses
            .filter((course) => offeredInGrade(course, grade) && !hasCourseInGrade(course, program, grade))
            .map((course) => {
                const prior = matchingPriorClass(course, grade, priorClasses);
                return prior ? {
                    course,
                    program,
                    reason: `Builds on your Grade ${prior.grade} ${programName(prior.subjectId)} class`
                } : null;
            })
            .filter(Boolean)
    );
    const seenCourses = new Set();
    const personalized = candidates.filter(({ course }) => {
        const title = normalizedText(course.title);
        if (seenCourses.has(title)) return false;
        seenCourses.add(title);
        return true;
    }).slice(0, 3);

    return personalized.length
        ? { courses: personalized, personalized: true, priorCount: priorClasses.length }
        : { courses: commonStartingCourses(grade), personalized: false, priorCount: priorClasses.length };
}

function programName(subjectId) {
    return window.PASCACK_PROGRAMS.find((program) => program.id === subjectId)?.name || "prior";
}

function potentialNextCourses(course, program, grade) {
    const title = normalizedText(course.title);
    const laterCourses = program.courses.filter((nextCourse) =>
        nextCourse.title !== course.title &&
        (nextCourse.grades || "").split(",").some((value) => Number(value.trim()) > Number(grade))
    );
    const exactNextCourses = laterCourses.filter((nextCourse) =>
        normalizedText(nextCourse.prerequisite || "").includes(title)
    );
    if (exactNextCourses.length) return exactNextCourses.slice(0, 2);

    const coreCourse = {
        english: /^english (?:i|ii|iii|iv)\b|^american studies\b/i,
        "social-studies": /^world history$|^u\. s\. history [iI]+$/i
    }[program.id];
    if (!coreCourse?.test(course.title)) return [];

    const subjectPattern = {
        english: /\benglish\b|\blanguage arts\b/,
        "social-studies": /\bhistory\b|\bsocial studies\b/,
        mathematics: /\bmath\b|\balgebra\b|\bgeometry\b/,
        science: /\bscience\b|\bbiology\b|\bchemistry\b|\bphysics\b/,
        "world-languages": /\bworld language\b|\bspanish\b|\bfrench\b|\bitalian\b|\bchinese\b/,
        art: /\bart\b|\bstudio\b/
    }[program.id];
    if (!subjectPattern) return [];
    return laterCourses.filter((nextCourse) => {
        const prerequisite = (nextCourse.prerequisite || "").toLocaleLowerCase();
        return new RegExp(`\\b${grade}(?:st|nd|rd|th)\\s*grade\\b`).test(prerequisite) &&
            subjectPattern.test(prerequisite);
    }).slice(0, 2);
}

function courseNodeId(course, program, grade) {
    return `pathway-${program.id}-${grade}-${normalizedText(course.title).replaceAll(" ", "-")}`;
}

function showNextGrade(course, program, currentGrade) {
    const nextGrade = StudentPlanner.grades.find((grade) =>
        Number(grade) > Number(currentGrade) && offeredInGrade(course, grade)
    );
    if (!nextGrade) return;
    gradePicker.value = nextGrade;
    roadmapState.profile.currentGrade = nextGrade;
    saveRoadmapState();
    requestAnimationFrame(() => {
        document.getElementById(courseNodeId(course, program, nextGrade))?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });
}

function addToMap(course, program, grade) {
    const key = courseKey(course, program, grade);
    roadmapState.maps[grade] ||= {};
    roadmapState.maps[grade][program.id] ||= [];
    if (!roadmapState.maps[grade][program.id].includes(key)) {
        roadmapState.maps[grade][program.id].push(key);
    }
    roadmapState.classes[key] ||= {
        key,
        title: course.title,
        subjectId: program.id,
        subjectName: program.name,
        grade,
        status: "planned",
        mark: "",
        credits: 5,
        requirement: ""
    };
    saveRoadmapState();
}

function removeFromMap(key, grade, subjectId) {
    roadmapState.maps[grade][subjectId] = (roadmapState.maps[grade][subjectId] || [])
        .filter((item) => item !== key);
    const usedInSchedule = Object.values(roadmapState.schedule)
        .some((schedule) => Object.values(schedule).includes(key));
    if (!usedInSchedule && roadmapState.classes[key]?.status === "planned") {
        delete roadmapState.classes[key];
    }
    saveRoadmapState();
}

function createCourseCard(course, program, grade, { compact = false } = {}) {
    const key = courseKey(course, program, grade);
    const record = roadmapState.classes[key];
    const mapped = isInMap(key, grade, program.id);
    const card = document.createElement("article");
    card.className = `grade-course-card${compact ? " grade-course-card-recommended" : ""}`;
    if (record?.status === "completed") card.classList.add("is-completed");
    else if (record?.status === "current") card.classList.add("is-current");
    else if (record?.status === "planned" || mapped) card.classList.add("is-planned");

    const title = document.createElement("h4");
    title.textContent = course.title;
    const status = document.createElement("span");
    status.className = "grade-course-status";
    status.textContent = record
        ? record.status === "completed" ? "Completed" :
            record.status === "current" ? "In progress" : "On your plan"
        : `${program.name} · Grade ${grade}`;

    const detail = document.createElement("details");
    detail.className = "grade-course-details";
    const summary = document.createElement("summary");
    summary.textContent = course.prerequisite ? "Prerequisite & next steps" : "See where it can lead";
    const detailText = document.createElement("p");
    detailText.textContent = course.prerequisite
        ? `Before you take it: ${course.prerequisite}`
        : "No prerequisite is listed in the catalog.";
    detail.append(summary, detailText);
    const nextCourses = potentialNextCourses(course, program, grade);
    if (nextCourses.length) {
        const path = document.createElement("p");
        path.className = "grade-course-path";
        path.append(document.createTextNode("Can lead to: "));
        nextCourses.forEach((nextCourse, index) => {
            if (index) path.append(document.createTextNode(" · "));
            const link = document.createElement("a");
            link.href = "#department-roadmap-title";
            link.textContent = nextCourse.title;
            link.addEventListener("click", (event) => {
                event.preventDefault();
                showNextGrade(nextCourse, program, grade);
            });
            path.append(link);
        });
        detail.append(path);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = mapped ? "button button-quiet" : "button button-outline";
    if (record && record.status !== "planned") {
        button.textContent = record.status === "completed" ? "Completed" : "In progress";
        button.disabled = true;
    } else {
        button.textContent = mapped || record?.status === "planned" ? "Remove from plan" : "Add to my plan";
        button.addEventListener("click", () => {
            if (mapped || record?.status === "planned") removeFromMap(key, grade, program.id);
            else addToMap(course, program, grade);
        });
    }

    card.append(status, title, detail, button);
    return card;
}

function renderRecommendations(grade) {
    const recommendations = recommendationsForGrade(grade);
    recommendedList.replaceChildren();
    recommendationIntro.textContent = recommendations.personalized
        ? `Based on ${recommendations.priorCount} completed or current ${
            recommendations.priorCount === 1 ? "class" : "classes"
        } from earlier grades.`
        : "Common core starting points for this grade. Add completed classes to get suggestions based on your own path.";

    if (!recommendations.courses.length) {
        const empty = document.createElement("p");
        empty.className = "roadmap-supporting-copy";
        empty.textContent = "Your plan already includes the common starting courses for this grade. Browse another department to explore electives and advanced options.";
        recommendedList.append(empty);
        return;
    }
    for (const { course, program, reason } of recommendations.courses) {
        const card = createCourseCard(course, program, grade, { compact: true });
        const note = document.createElement("p");
        note.className = "recommendation-reason";
        note.textContent = reason;
        card.insertBefore(note, card.querySelector("details"));
        recommendedList.append(card);
    }
}

function renderCurrentGrade(grade) {
    currentTitle.textContent = `Your Grade ${grade} classes`;
    currentCourses.replaceChildren();
    const courses = Object.values(roadmapState.classes)
        .filter((course) => course.grade === grade)
        .sort((first, second) => first.title.localeCompare(second.title));
    emptyGradeMessage.hidden = courses.length > 0;
    emptyGradeMessage.textContent = "Your plan is ready when you are. Add a suggested class or explore a subject below.";
    for (const course of courses) {
        const item = document.createElement("div");
        item.className = `current-grade-course status-${course.status}`;
        const details = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = course.title;
        const meta = document.createElement("small");
        meta.textContent = `${programName(course.subjectId)} · ${
            course.status === "completed" ? "Completed" :
                course.status === "current" ? "In progress" : "Planned"
        }${course.mark ? ` · ${course.mark}` : ""}`;
        details.append(name, meta);
        item.append(details);
        if (course.status === "planned") {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "button button-quiet";
            remove.textContent = "Remove";
            remove.setAttribute("aria-label", `Remove ${course.title} from your plan`);
            remove.addEventListener("click", () => removeFromMap(
                course.key || StudentPlanner.courseKey(course, grade),
                grade,
                course.subjectId
            ));
            item.append(remove);
        }
        currentCourses.append(item);
    }
}

function renderDepartmentCourses(grade) {
    const program = window.PASCACK_PROGRAMS.find((item) => item.id === departmentPicker.value);
    courseList.replaceChildren();
    if (!program) return;
    const courses = program.courses.filter((course) => offeredInGrade(course, grade));
    if (!courses.length) {
        const empty = document.createElement("p");
        empty.className = "roadmap-supporting-copy";
        empty.textContent = `No courses are listed for ${program.name} in Grade ${grade}. Ask your counselor about other options.`;
        courseList.append(empty);
        return;
    }
    for (const course of courses) courseList.append(createCourseCard(course, program, grade));
}

function renderTranscript() {
    mapList.replaceChildren();
    for (const grade of StudentPlanner.grades) {
        const section = document.createElement("section");
        section.className = "saved-map-year transcript-year";
        const heading = document.createElement("h3");
        heading.textContent = `Grade ${grade}`;
        const list = document.createElement("ul");
        const courses = Object.values(roadmapState.classes)
            .filter((course) => course.grade === grade)
            .sort((first, second) => first.title.localeCompare(second.title));
        if (!courses.length) {
            const empty = document.createElement("li");
            empty.className = "transcript-empty";
            empty.textContent = "No classes added.";
            list.append(empty);
        }
        for (const course of courses) {
            const item = document.createElement("li");
            const title = document.createElement("strong");
            title.textContent = course.title;
            const meta = document.createElement("small");
            meta.textContent = `${programName(course.subjectId)} · ${
                course.status === "completed" ? "Completed" :
                    course.status === "current" ? "In progress" : "Planned"
            }${course.mark ? ` · ${course.mark}` : ""}`;
            item.append(title, meta);
            list.append(item);
        }
        section.append(heading, list);
        mapList.append(section);
    }
}

function renderCreditProgress() {
    const container = document.querySelector("#graduation-credit-progress");
    const totals = StudentPlanner.creditTotals(roadmapState);
    container.replaceChildren();
    const total = document.createElement("p");
    total.className = "credit-total-summary";
    total.textContent = `${totals.earned.toFixed(1)} credits earned/current · ${totals.planned.toFixed(1)} planned · ${Math.max(0, 120 - totals.earned - totals.planned).toFixed(1)} to plan toward 120`;
    container.append(total);
    for (const [id, label] of Object.entries(StudentPlanner.requirementLabels)) {
        const row = document.createElement("div");
        row.className = "credit-progress-row";
        const text = document.createElement("span");
        text.textContent = label;
        const amount = document.createElement("strong");
        amount.textContent = `${totals.requirements[id].earned.toFixed(1)} earned/current + ${totals.requirements[id].planned.toFixed(1)} planned / ${StudentPlanner.requirementTargets[id]} estimated`;
        row.append(text, amount);
        container.append(row);
    }
}

function renderRoadmap() {
    const grade = gradePicker.value;
    renderRecommendations(grade);
    renderCurrentGrade(grade);
    renderDepartmentCourses(grade);
    renderTranscript();
    renderCreditProgress();
    mathNote.hidden = departmentPicker.value !== "mathematics" ||
        (!roadmapState.profile.math8Course && !roadmapState.profile.math8Grade);
    if (!mathNote.hidden) {
        mathNote.textContent = `Your 8th-grade math information: ${roadmapState.profile.math8Course || "class not entered"}${roadmapState.profile.math8Grade ? ` · ${roadmapState.profile.math8Grade}` : ""}. Confirm placement with your school.`;
    }
}

try {
    roadmapState = StudentPlanner.load();
} catch (error) {
    roadmapState = StudentPlanner.createState();
    feedback.textContent = error.message;
    feedback.classList.add("save-status-error");
}

for (const program of window.PASCACK_PROGRAMS) {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = program.name;
    departmentPicker.append(option);
}

const departmentPrompt = document.createElement("option");
departmentPrompt.value = "";
departmentPrompt.textContent = "Choose a department to browse";
departmentPrompt.selected = true;
departmentPicker.prepend(departmentPrompt);
gradePicker.value = roadmapState.profile.currentGrade || "9";
gradePicker.addEventListener("change", () => {
    roadmapState.profile.currentGrade = gradePicker.value;
    saveRoadmapState();
});
departmentPicker.addEventListener("change", renderRoadmap);
renderRoadmap();
