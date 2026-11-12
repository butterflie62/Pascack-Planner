const roadmapGrade = document.querySelector("#roadmap-grade");
const departmentPicker = document.querySelector("#roadmap-department");
const courseList = document.querySelector("#department-course-list");
const mapList = document.querySelector("#saved-map-list");
const feedback = document.querySelector("#roadmap-feedback");
const mathNote = document.querySelector("#roadmap-math-note");
let roadmapState;

function saveRoadmapState() {
    try {
        StudentPlanner.save(roadmapState);
        feedback.textContent = "Your map is saved in this browser.";
        feedback.classList.remove("save-status-error");
        renderRoadmap();
    } catch (error) {
        feedback.textContent = error.message;
        feedback.classList.add("save-status-error");
    }
}

function getStudentCourse(subjectId, title, grade) {
    const key = StudentPlanner.courseKey({ subjectId, title }, grade);
    return roadmapState.classes[key];
}

function gradeListing(course, grade) {
    if (!course.grades) return "Grade listing not provided";
    return course.grades.split(",").map((value) => value.trim()).includes(grade)
        ? `Listed for Grade ${grade}`
        : `Grade ${grade} not listed`;
}

function prerequisiteGuidance(program, course) {
    if (!course.prerequisite) return "No prerequisite listed.";
    const text = course.prerequisite.toLocaleLowerCase();
    if (/8th grade|8th-grade/.test(text)) {
        return roadmapState.profile.math8Course || roadmapState.profile.math8Grade
            ? "8th-grade math is in your profile; confirm any placement score or benchmark."
            : "Enter 8th-grade math in My Plan, then confirm the placement benchmark with your school.";
    }

    const departmentByTerm = [
        { pattern: /english|language arts/, id: "english" },
        { pattern: /history|social studies/, id: "social-studies" },
        { pattern: /math|algebra|geometry/, id: "mathematics" },
        { pattern: /science|biology|chemistry|physics/, id: "science" },
        { pattern: /world language|spanish|french|italian|chinese/, id: "world-languages" },
        { pattern: /\bart\b|studio/, id: "art" }
    ];
    const requiredClasses = [];
    for (const match of text.matchAll(/(\d+)(?:st|nd|rd|th)\s*grade\s*([^;]+)/g)) {
        for (const department of departmentByTerm) {
            if (department.pattern.test(match[2])) {
                requiredClasses.push({ grade: match[1], subjectId: department.id });
            }
        }
    }
    if (requiredClasses.length) {
        const missing = requiredClasses.filter((required) =>
            !Object.values(roadmapState.classes).some((item) =>
                item.status === "completed" && item.subjectId === required.subjectId && item.grade === required.grade
            )
        );
        return missing.length
            ? `Add completed Grade ${missing.map((item) => item.grade).join(", ")} ${missing.map((item) => window.PASCACK_PROGRAMS.find((programItem) => programItem.id === item.subjectId)?.name).filter(Boolean).join(" and ")} classes in My Plan to check this prerequisite.`
            : "The listed prior-year classes appear in your completed courses; confirm placement with your school.";
    }

    const matchingCourse = window.PASCACK_PROGRAMS
        .flatMap((item) => item.courses.map((entry) => ({ ...entry, subjectId: item.id })))
        .find((entry) => entry.title.length > 5 && text.includes(entry.title.toLocaleLowerCase()));
    if (matchingCourse) {
        const completed = Object.values(roadmapState.classes).some((item) =>
            item.status === "completed" && item.subjectId === matchingCourse.subjectId && item.title === matchingCourse.title
        );
        return completed
            ? "The listed prior course appears in your completed courses; check any additional approval."
            : `Complete ${matchingCourse.title} first, then confirm any additional approval.`;
    }
    return "Confirm this prerequisite and course placement with your school.";
}

function renderDepartmentCourses() {
    const grade = roadmapGrade.value;
    const program = window.PASCACK_PROGRAMS.find((item) => item.id === departmentPicker.value);
    courseList.replaceChildren();
    if (!program || !program.courses.length) {
        const empty = document.createElement("p");
        empty.className = "guide-note";
        empty.textContent = "There are no course entries for this department in the current catalog. Ask your counselor for pathway information.";
        courseList.append(empty);
        return;
    }

    for (const course of program.courses) {
        const key = StudentPlanner.courseKey({ ...course, subjectId: program.id }, grade);
        const saved = getStudentCourse(program.id, course.title, grade);
        const record = Object.values(roadmapState.classes).find((item) =>
            item.subjectId === program.id && item.title === course.title &&
            ["completed", "current"].includes(item.status)
        );
        const card = document.createElement("article");
        card.className = "department-course-card";
        const heading = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = course.title;
        const state = document.createElement("span");
        state.className = "course-availability";
        state.textContent = record
            ? `${record.status === "completed" ? "Completed" : "Current"}${record.mark ? ` · ${record.mark}` : ""}`
            : saved?.status === "planned" ? "On your map" : gradeListing(course, grade);
        heading.append(title, state);
        const details = document.createElement("p");
        details.textContent = course.prerequisite
            ? `Prerequisite: ${course.prerequisite} ${prerequisiteGuidance(program, course)}`
            : "No prerequisite listed in the catalog.";
        const actions = document.createElement("div");
        actions.className = "department-course-actions";
        if (record) {
            const note = document.createElement("span");
            note.className = "course-record-note";
            note.textContent = record.grade === grade ? `Recorded for Grade ${grade}` : `Recorded in Grade ${record.grade}`;
            actions.append(note);
        } else {
            const add = document.createElement("button");
            add.type = "button";
            add.className = "button button-outline";
            add.textContent = saved?.status === "planned" ? "Remove from map" : `Add to Grade ${grade} map`;
            add.addEventListener("click", () => {
                roadmapState.maps[grade] ||= {};
                roadmapState.maps[grade][program.id] ||= [];
                if (saved?.status === "planned") {
                    roadmapState.maps[grade][program.id] = roadmapState.maps[grade][program.id].filter((item) => item !== key);
                    if (!Object.values(roadmapState.schedule).some((schedule) => Object.values(schedule).includes(key))) {
                        delete roadmapState.classes[key];
                    }
                } else {
                    roadmapState.maps[grade][program.id].push(key);
                    roadmapState.classes[key] = {
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
                }
                saveRoadmapState();
            });
            actions.append(add);
        }
        card.append(heading, details, actions);
        courseList.append(card);
    }
}

function renderSavedMap() {
    mapList.replaceChildren();
    let count = 0;
    for (const grade of StudentPlanner.grades) {
        const departments = roadmapState.maps[grade] || {};
        const items = Object.entries(departments).flatMap(([subjectId, keys]) =>
            (Array.isArray(keys) ? keys : []).map((key) => ({ key, subjectId }))
        );
        if (!items.length) continue;
        count += items.length;
        const section = document.createElement("section");
        section.className = "saved-map-year";
        const heading = document.createElement("h3");
        heading.textContent = `Grade ${grade}`;
        const list = document.createElement("ul");
        for (const { key, subjectId } of items) {
            const record = roadmapState.classes[key];
            const program = window.PASCACK_PROGRAMS.find((item) => item.id === subjectId);
            if (!record || !program) continue;
            const item = document.createElement("li");
            const details = document.createElement("span");
            details.textContent = `${record.title} · ${program.name} · ${record.status}`;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "button button-quiet";
            remove.textContent = "Remove";
            remove.addEventListener("click", () => {
                roadmapState.maps[grade][subjectId] = roadmapState.maps[grade][subjectId].filter((savedKey) => savedKey !== key);
                if (!Object.values(roadmapState.schedule).some((schedule) => Object.values(schedule).includes(key))) {
                    delete roadmapState.classes[key];
                }
                saveRoadmapState();
            });
            item.append(details, remove);
            list.append(item);
        }
        section.append(heading, list);
        mapList.append(section);
    }
    if (!count) {
        mapList.textContent = "Your map is empty. Choose a department above to start saving options for future years.";
    }
}

function renderCreditProgress() {
    const container = document.querySelector("#graduation-credit-progress");
    const totals = StudentPlanner.creditTotals(roadmapState);
    container.replaceChildren();
    const total = document.createElement("p");
    total.className = "credit-total-summary";
    total.textContent = `${totals.earned.toFixed(1)} credits earned/current · ${totals.planned.toFixed(1)} planned · ${Math.max(0, 120 - totals.earned - totals.planned).toFixed(1)} still to plan toward 120`;
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
    renderDepartmentCourses();
    renderSavedMap();
    renderCreditProgress();
    mathNote.hidden = departmentPicker.value !== "mathematics" || (!roadmapState.profile.math8Course && !roadmapState.profile.math8Grade);
    if (!mathNote.hidden) {
        mathNote.textContent = `Your 8th-grade math information: ${roadmapState.profile.math8Course || "class not entered"}${roadmapState.profile.math8Grade ? ` · ${roadmapState.profile.math8Grade}` : ""}. Some math courses list placement scores or prerequisites; confirm placement with your school.`;
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
roadmapGrade.value = roadmapState.profile.currentGrade || "9";
roadmapGrade.addEventListener("change", renderRoadmap);
departmentPicker.addEventListener("change", renderRoadmap);
renderRoadmap();
