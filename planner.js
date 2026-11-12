const DAYS = [
    { id: "monday", name: "Monday" },
    { id: "tuesday", name: "Tuesday" },
    { id: "wednesday", name: "Wednesday" },
    { id: "thursday", name: "Thursday" },
    { id: "friday", name: "Friday" }
];
const courses = (window.PASCACK_PROGRAMS || []).flatMap((program) =>
    program.courses.map((course) => ({ ...course, subject: program.name, subjectId: program.id }))
);
const gradePicker = document.querySelector("#planner-grade");
const scheduleBody = document.querySelector("#schedule-body");
const summary = document.querySelector("#schedule-summary");
const status = document.querySelector("#save-status");
const picker = document.querySelector("#course-picker");
const pickerSearch = document.querySelector("#picker-search");
const pickerResults = document.querySelector("#picker-results");
const pickerSlotLabel = document.querySelector("#picker-slot-label");
const creditInput = document.querySelector("#picker-credits");
const requirementPicker = document.querySelector("#picker-requirement");
let studentState;
let activeSlot = null;

function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("save-status-error", isError);
}

function saveStudentState() {
    try {
        StudentPlanner.save(studentState);
        showStatus("Saved on this device");
        renderCreditProgress();
    } catch (error) {
        showStatus(error.message, true);
    }
}

function currentSchedule() {
    const grade = gradePicker.value;
    studentState.schedule[grade] ||= {};
    return studentState.schedule[grade];
}

function slotKey(period, day) {
    return `${period}-${day}`;
}

function courseFor(key) {
    return studentState.classes[key];
}

function renderSchedule() {
    const schedule = currentSchedule();
    scheduleBody.replaceChildren();
    for (let period = 1; period <= 8; period += 1) {
        const row = document.createElement("tr");
        const heading = document.createElement("th");
        heading.scope = "row";
        heading.className = "period-cell";
        heading.textContent = `Period ${period}`;
        row.append(heading);

        for (const day of DAYS) {
            const cell = document.createElement("td");
            const key = slotKey(period, day.id);
            const courseKey = schedule[key];
            const course = courseFor(courseKey);
            const button = document.createElement("button");
            button.type = "button";
            button.className = course ? "schedule-slot schedule-slot-filled" : "schedule-slot";
            button.setAttribute("aria-label", course
                ? `Period ${period}, ${day.name}: ${course.title}. Change class`
                : `Choose a class for Period ${period}, ${day.name}`);

            if (course) {
                const title = document.createElement("strong");
                title.textContent = course.title;
                const subject = document.createElement("span");
                subject.className = "schedule-slot-subject";
                subject.textContent = course.subjectName;
                button.append(title, subject);

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "remove-slot";
                remove.textContent = "Remove";
                remove.setAttribute("aria-label", `Remove ${course.title} from Period ${period}, ${day.name}`);
                remove.addEventListener("click", (event) => {
                    event.stopPropagation();
                    delete schedule[key];
                    saveStudentState();
                    renderSchedule();
                });
                cell.append(button, remove);
            } else {
                const plus = document.createElement("span");
                plus.className = "slot-plus";
                plus.setAttribute("aria-hidden", "true");
                plus.textContent = "+";
                const label = document.createElement("span");
                label.textContent = "Add class";
                button.append(plus, label);
                cell.append(button);
            }

            button.addEventListener("click", () => openPicker(period, day, key));
            row.append(cell);
        }
        scheduleBody.append(row);
    }

    const coursesPlanned = new Set(Object.values(schedule).filter((key) => studentState.classes[key]));
    summary.textContent = `Grade ${gradePicker.value} · ${coursesPlanned.size} unique ${coursesPlanned.size === 1 ? "course" : "courses"} scheduled`;
    renderCreditProgress();
}

function renderCreditProgress() {
    const container = document.querySelector("#planner-credit-progress");
    const totals = StudentPlanner.creditTotals(studentState);
    container.replaceChildren();
    const total = document.createElement("p");
    total.className = "credit-total-summary";
    total.textContent = `${totals.earned.toFixed(1)} credits earned/current · ${totals.planned.toFixed(1)} planned · ${Math.max(0, 120 - totals.earned - totals.planned).toFixed(1)} remaining toward 120`;
    container.append(total);
    for (const [id, label] of Object.entries(StudentPlanner.requirementLabels)) {
        const row = document.createElement("div");
        row.className = "credit-progress-row";
        const requirement = document.createElement("span");
        requirement.textContent = label;
        const progress = document.createElement("strong");
        progress.textContent = `${(totals.requirements[id].earned + totals.requirements[id].planned).toFixed(1)} / ${StudentPlanner.requirementTargets[id]} estimated credits`;
        row.append(requirement, progress);
        container.append(row);
    }
}

function renderPicker(query = "") {
    const term = query.trim().toLocaleLowerCase();
    const matches = courses.filter((course) =>
        `${course.title} ${course.subject} ${course.prerequisite}`.toLocaleLowerCase().includes(term)
    );
    pickerResults.replaceChildren();

    if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "picker-empty";
        empty.textContent = "No courses found. Try a different search.";
        pickerResults.append(empty);
        return;
    }

    const grouped = new Map();
    for (const course of matches) {
        if (!grouped.has(course.subject)) grouped.set(course.subject, []);
        grouped.get(course.subject).push(course);
    }

    for (const [subject, subjectCourses] of grouped) {
        const section = document.createElement("section");
        section.className = "picker-subject";
        const heading = document.createElement("h3");
        heading.textContent = subject;
        section.append(heading);

        const list = document.createElement("div");
        list.className = "picker-course-list";
        for (const course of subjectCourses) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "picker-course-option";
            button.textContent = `${course.title}${course.prerequisite ? ` · Prerequisite: ${course.prerequisite}` : ""}`;
            button.addEventListener("click", () => {
                const grade = gradePicker.value;
                const key = StudentPlanner.courseKey(course, grade);
                if (!studentState.classes[key]) {
                    studentState.classes[key] = {
                        key,
                        title: course.title,
                        subjectId: course.subjectId,
                        subjectName: course.subject,
                        grade,
                        status: "planned",
                        mark: "",
                        credits: Number(creditInput.value) || 0,
                        requirement: requirementPicker.value
                    };
                }
                studentState.maps[grade] ||= {};
                studentState.maps[grade][course.subjectId] ||= [];
                if (!studentState.maps[grade][course.subjectId].includes(key)) {
                    studentState.maps[grade][course.subjectId].push(key);
                }
                currentSchedule()[activeSlot.key] = key;
                saveStudentState();
                renderSchedule();
                picker.close();
            });
            list.append(button);
        }
        section.append(list);
        pickerResults.append(section);
    }
}

function openPicker(period, day, key) {
    activeSlot = { period, day, key };
    pickerSlotLabel.textContent = `Grade ${gradePicker.value} · Period ${period} · ${day.name}`;
    pickerSearch.value = "";
    creditInput.value = "5";
    requirementPicker.value = "";
    renderPicker();
    picker.showModal();
    pickerSearch.focus();
}

function migrateOldSchedule() {
    const old = localStorage.getItem("pascack-planner-schedule-v1");
    if (!old || Object.values(studentState.schedule).some((schedule) => Object.keys(schedule || {}).length)) return;
    try {
        const previous = JSON.parse(old);
        if (!previous || !previous.slots || !["9", "10", "11", "12"].includes(String(previous.grade))) return;
        const grade = String(previous.grade);
        studentState.schedule[grade] ||= {};
        for (const [slot, selection] of Object.entries(previous.slots)) {
            const course = typeof selection === "string"
                ? courses.find((item) => item.title === selection)
                : courses.find((item) => item.title === selection?.title && item.subjectId === selection?.subjectId);
            if (!course) continue;
            const key = StudentPlanner.courseKey(course, grade);
            studentState.classes[key] ||= {
                key,
                title: course.title,
                subjectId: course.subjectId,
                subjectName: course.subject,
                grade,
                status: "planned",
                mark: "",
                credits: 5,
                requirement: ""
            };
            studentState.schedule[grade][slot] = key;
        }
    } catch (error) {
        showStatus(`Could not migrate your previous schedule: ${error.message}`, true);
    }
}

for (const [id, label] of Object.entries(StudentPlanner.requirementLabels)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    requirementPicker.append(option);
}
requirementPicker.insertAdjacentHTML("afterbegin", '<option value="">Not assigned</option>');
requirementPicker.value = "";

try {
    studentState = StudentPlanner.load();
} catch (error) {
    studentState = StudentPlanner.createState();
    showStatus(error.message, true);
}
migrateOldSchedule();
gradePicker.value = studentState.profile.planningGrade || studentState.profile.currentGrade || "9";
gradePicker.addEventListener("change", () => {
    studentState.profile.planningGrade = gradePicker.value;
    saveStudentState();
    renderSchedule();
});
pickerSearch.addEventListener("input", () => renderPicker(pickerSearch.value));
document.querySelector("#close-picker").addEventListener("click", () => picker.close());
document.querySelector("#print-schedule").addEventListener("click", () => window.print());
document.querySelector("#clear-schedule").addEventListener("click", () => {
    if (!window.confirm("Clear this grade's weekly schedule? Saved courses will remain on your four-year map.")) return;
    studentState.schedule[gradePicker.value] = {};
    saveStudentState();
    renderSchedule();
});
try {
    if (studentState.profile.planningGrade || Object.keys(studentState.classes).length) StudentPlanner.save(studentState);
} catch (error) {
    showStatus(error.message, true);
}
renderSchedule();
