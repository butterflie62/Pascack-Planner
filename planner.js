const DAYS = [
    { id: "monday", name: "Monday" },
    { id: "tuesday", name: "Tuesday" },
    { id: "wednesday", name: "Wednesday" },
    { id: "thursday", name: "Thursday" },
    { id: "friday", name: "Friday" }
];
const MONDAY_PERIODS_BY_DAY = {
    monday: [1, 2, 3, 4, 5, 6, 7, 8],
    tuesday: [1, 2, 3, null, 5, 6, 7, null],
    wednesday: [4, 1, 2, null, 8, 5, 6, null],
    thursday: [3, 4, 1, null, 7, 8, 5, null],
    friday: [2, 3, 4, null, 6, 7, 8, null]
};
const FUTURE_COURSE_SLOTS = [
    { id: "math", label: "Math", subjectIds: ["mathematics"] },
    { id: "english", label: "English", subjectIds: ["english"] },
    { id: "history", label: "History", subjectIds: ["social-studies"] },
    { id: "science", label: "Science", subjectIds: ["science"] },
    { id: "gym", label: "Gym", subjectIds: ["health-physical-education"] },
    { id: "language-elective", label: "Language or elective", subjectIds: ["world-languages"], acceptsAnyCourse: true },
    { id: "elective-1", label: "Elective 1", acceptsAnyCourse: true },
    { id: "elective-2", label: "Elective 2", acceptsAnyCourse: true }
];
const courses = (window.PASCACK_PROGRAMS || []).flatMap((program) =>
    program.courses.map((course) => ({ ...course, subject: program.name, subjectId: program.id }))
);
const gradePicker = document.querySelector("#planner-grade");
const scheduleBody = document.querySelector("#schedule-body");
const scheduleHeading = document.querySelector("#schedule-heading");
const scheduleHeadingRow = document.querySelector("#schedule-heading-row");
const scheduleFootnote = document.querySelector("#schedule-footnote");
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
        return true;
    } catch (error) {
        showStatus(error.message, true);
        return false;
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

function isFutureGrade() {
    return Number(gradePicker.value) > Number(studentState.profile.currentGrade || "9");
}

function futureCourseSlots() {
    studentState.profile.plannerCourseSlots ||= {};
    studentState.profile.plannerCourseSlots[gradePicker.value] ||= {};
    return studentState.profile.plannerCourseSlots[gradePicker.value];
}

function renderScheduleHeadings(isCoursePlan) {
    const labels = isCoursePlan
        ? ["Course area", "Planned class"]
        : ["Period", ...DAYS.map((day) => day.name)];
    scheduleHeadingRow.replaceChildren();
    for (const [index, label] of labels.entries()) {
        const heading = document.createElement("th");
        heading.scope = "col";
        if (index === 0) heading.className = "period-heading";
        heading.textContent = label;
        if (!isCoursePlan && index > 0) {
            const abbreviation = document.createElement("span");
            abbreviation.textContent = ["M", "T", "W", "R", "F"][index - 1];
            heading.append(" ", abbreviation);
        }
        scheduleHeadingRow.append(heading);
    }
}

function renderSchedule() {
    const grade = gradePicker.value;
    const isCoursePlan = isFutureGrade();
    scheduleHeading.textContent = isCoursePlan ? `Grade ${grade} course plan` : "My week";
    scheduleFootnote.textContent = isCoursePlan
        ? "Choose a course for each subject area. The language slot can also be used for an elective."
        : "Add classes on Monday. They’ll rotate through the rest of the week, with each class marked by its Monday period number.";
    renderScheduleHeadings(isCoursePlan);
    scheduleBody.replaceChildren();

    if (isCoursePlan) {
        const plannedSlots = futureCourseSlots();
        const coursesPlanned = new Set();
        for (const slot of FUTURE_COURSE_SLOTS) {
            const row = document.createElement("tr");
            const heading = document.createElement("th");
            heading.scope = "row";
            heading.className = "period-cell";
            heading.textContent = slot.label;
            row.append(heading);

            const cell = document.createElement("td");
            const courseKey = plannedSlots[slot.id];
            const course = courseFor(courseKey);
            const button = document.createElement("button");
            button.type = "button";
            button.className = course ? "schedule-slot schedule-slot-filled" : "schedule-slot";
            button.setAttribute("aria-label", course
                ? `${slot.label}: ${course.title}. Change class`
                : `Choose a class for ${slot.label}`);
            if (course) {
                const title = document.createElement("strong");
                title.textContent = course.title;
                const subject = document.createElement("span");
                subject.className = "schedule-slot-subject";
                subject.textContent = course.subjectName;
                button.append(title, subject);
                coursesPlanned.add(courseKey);

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "remove-slot";
                remove.textContent = "Remove";
                remove.setAttribute("aria-label", `Remove ${course.title} from ${slot.label}`);
                remove.addEventListener("click", (event) => {
                    event.stopPropagation();
                    delete plannedSlots[slot.id];
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
            button.addEventListener("click", () => openCourseSlotPicker(slot));
            row.append(cell);
            scheduleBody.append(row);
        }
        summary.textContent = `Grade ${grade} · ${coursesPlanned.size} unique ${coursesPlanned.size === 1 ? "course" : "courses"} planned`;
        renderCreditProgress();
        return;
    }

    const schedule = currentSchedule();
    for (let period = 1; period <= 8; period += 1) {
        const row = document.createElement("tr");
        const heading = document.createElement("th");
        heading.scope = "row";
        heading.className = "period-cell";
        heading.textContent = `Period ${period}`;
        row.append(heading);

        for (const day of DAYS) {
            const cell = document.createElement("td");
            const isMonday = day.id === "monday";
            const mondayPeriod = MONDAY_PERIODS_BY_DAY[day.id][period - 1];
            const key = slotKey(period, day.id);
            const courseKey = isMonday
                ? schedule[key]
                : mondayPeriod === null ? undefined : schedule[slotKey(mondayPeriod, "monday")];
            const course = courseFor(courseKey);
            const button = document.createElement("button");
            button.type = "button";
            button.className = course
                ? `schedule-slot schedule-slot-filled${isMonday ? "" : " schedule-slot-rotated"}`
                : "schedule-slot";
            if (mondayPeriod !== null) button.classList.add(`schedule-period-${mondayPeriod}`);
            button.disabled = !isMonday;
            button.setAttribute("aria-label", course
                ? `${day.name} slot ${period}: ${course.title}, Monday Period ${mondayPeriod}. ${isMonday ? "Change class" : "Rotated from Monday"}`
                : isMonday
                    ? `Choose a class for Monday Period ${period}`
                    : mondayPeriod === null
                        ? `Does not meet in ${day.name} slot ${period}`
                        : `No class planned for ${day.name} slot ${period}, from Monday Period ${mondayPeriod}`);

            if (course) {
                const periodLabel = document.createElement("span");
                periodLabel.className = "schedule-slot-period";
                periodLabel.textContent = `P${mondayPeriod}`;
                const title = document.createElement("strong");
                title.textContent = course.title;
                const subject = document.createElement("span");
                subject.className = "schedule-slot-subject";
                subject.textContent = course.subjectName;
                button.append(periodLabel, title, subject);

                if (isMonday) {
                    const remove = document.createElement("button");
                    remove.type = "button";
                    remove.className = "remove-slot";
                    remove.textContent = "Remove";
                    remove.setAttribute("aria-label", `Remove ${course.title} from Monday Period ${period}`);
                    remove.addEventListener("click", () => {
                        delete schedule[key];
                        saveStudentState();
                        renderSchedule();
                    });
                    cell.append(button, remove);
                } else {
                    cell.append(button);
                }
            } else {
                const plus = document.createElement("span");
                plus.className = "slot-plus";
                plus.setAttribute("aria-hidden", "true");
                plus.textContent = isMonday ? "+" : "";
                const label = document.createElement("span");
                label.textContent = isMonday
                    ? "Add class"
                    : mondayPeriod === null ? "Does not meet" : "No class";
                button.append(plus, label);
                cell.append(button);
            }

            if (isMonday) button.addEventListener("click", () => openPicker(period, day, key));
            row.append(cell);
        }
        scheduleBody.append(row);
    }

    const coursesPlanned = new Set(Object.values(schedule).filter((key) => studentState.classes[key]));
    summary.textContent = `Grade ${grade} · ${coursesPlanned.size} unique ${coursesPlanned.size === 1 ? "course" : "courses"} scheduled`;
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
    const activeCourseSlot = activeSlot?.type === "course-slot"
        ? FUTURE_COURSE_SLOTS.find((slot) => slot.id === activeSlot.id)
        : null;
    const eligibleCourses = activeCourseSlot
        ? courses.filter((course) => {
            const allowedGrades = (course.grades || "").split(",").map((value) => value.trim());
            return allowedGrades.includes(gradePicker.value) &&
                (activeCourseSlot.acceptsAnyCourse || activeCourseSlot.subjectIds.includes(course.subjectId));
        })
        : courses;
    const matches = eligibleCourses.filter((course) =>
        `${course.title} ${course.subject} ${course.prerequisite}`.toLocaleLowerCase().includes(term)
    );
    pickerResults.replaceChildren();

    if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "picker-empty";
        empty.textContent = activeCourseSlot
            ? `No courses found for ${activeCourseSlot.label} in Grade ${gradePicker.value}.`
            : "No courses found. Try a different search.";
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
                if (activeSlot.type === "course-slot") {
                    futureCourseSlots()[activeSlot.id] = key;
                } else {
                    const schedule = currentSchedule();
                    schedule[activeSlot.key] = key;
                }
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
    activeSlot = { type: "period", period, day, key };
    pickerSlotLabel.textContent = `Grade ${gradePicker.value} · Period ${period} · ${day.name}`;
    openPickerDialog();
}

function openCourseSlotPicker(slot) {
    activeSlot = { type: "course-slot", id: slot.id, label: slot.label };
    pickerSlotLabel.textContent = `Grade ${gradePicker.value} · ${slot.label}`;
    openPickerDialog();
}

function openPickerDialog() {
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
    const isCoursePlan = isFutureGrade();
    const confirmation = isCoursePlan
        ? "Clear this grade's subject-based course plan? Saved courses will remain on your four-year map."
        : "Clear this grade's weekly schedule? Saved courses will remain on your four-year map.";
    if (!window.confirm(confirmation)) return;
    if (isCoursePlan) {
        studentState.profile.plannerCourseSlots ||= {};
        studentState.profile.plannerCourseSlots[gradePicker.value] = {};
    } else {
        studentState.schedule[gradePicker.value] = {};
    }
    saveStudentState();
    renderSchedule();
});
try {
    if (studentState.profile.planningGrade || Object.keys(studentState.classes).length) StudentPlanner.save(studentState);
} catch (error) {
    showStatus(error.message, true);
}
renderSchedule();
