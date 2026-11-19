const profileStatus = document.querySelector("#profile-status");
const transcriptStatus = document.querySelector("#transcript-status");
const transcriptInput = document.querySelector("#transcript-file");
const removeTranscriptButton = document.querySelector("#remove-transcript");
const subjectPicker = document.querySelector("#class-subject");
const coursePicker = document.querySelector("#class-course");
let studentState;

function showProfileStatus(message, isError = false) {
    profileStatus.textContent = message;
    profileStatus.classList.toggle("save-status-error", isError);
}

function saveStudentState() {
    try {
        StudentPlanner.save(studentState);
        showProfileStatus("Your plan is saved in this browser only.");
    } catch (error) {
        showProfileStatus(error.message, true);
    }
}

function fillCoursePicker() {
    const program = window.PASCACK_PROGRAMS.find((item) => item.id === subjectPicker.value);
    coursePicker.replaceChildren();
    for (const course of program?.courses || []) {
        const option = document.createElement("option");
        option.value = course.title;
        option.textContent = course.title;
        coursePicker.append(option);
    }
}

function renderClasses() {
    const list = document.querySelector("#class-list");
    list.replaceChildren();
    const entries = Object.entries(studentState.classes);
    if (!entries.length) {
        list.textContent = "No completed or current classes added yet.";
        return;
    }
    for (const [key, course] of entries) {
        const item = document.createElement("article");
        item.className = "student-class-item";
        const details = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = course.title;
        const meta = document.createElement("span");
        meta.textContent = course.subjectName;
        details.append(title, meta);
        const controls = document.createElement("div");
        controls.className = "class-record-controls";
        const grade = document.createElement("select");
        grade.setAttribute("aria-label", `Grade level for ${course.title}`);
        for (const value of StudentPlanner.grades) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = `Grade ${value}`;
            grade.append(option);
        }
        grade.value = course.grade;
        const status = document.createElement("select");
        status.setAttribute("aria-label", `Completion status for ${course.title}`);
        for (const value of ["completed", "current", "planned"]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value === "completed" ? "Completed" : value === "current" ? "Current" : "Planned";
            status.append(option);
        }
        status.value = course.status;
        const mark = document.createElement("input");
        mark.type = "text";
        mark.maxLength = 12;
        mark.placeholder = "Grade";
        mark.value = course.mark || "";
        mark.setAttribute("aria-label", `Grade earned in ${course.title}`);
        const credits = document.createElement("input");
        credits.type = "number";
        credits.min = "0";
        credits.max = "30";
        credits.step = "0.5";
        credits.value = course.credits || 0;
        credits.setAttribute("aria-label", `Credits for ${course.title}`);
        const requirement = document.createElement("select");
        requirement.setAttribute("aria-label", `Graduation requirement for ${course.title}`);
        for (const [id, label] of Object.entries(StudentPlanner.requirementLabels)) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = label;
            requirement.append(option);
        }
        requirement.value = course.requirement || "electives";
        const saveRecord = () => {
            const updatedGrade = grade.value;
            if (updatedGrade !== course.grade) {
                const updatedKey = StudentPlanner.courseKey({ subjectId: course.subjectId, title: course.title }, updatedGrade);
                delete studentState.classes[key];
                course.grade = updatedGrade;
                course.key = updatedKey;
                studentState.classes[updatedKey] = course;
                for (const plan of Object.values(studentState.maps)) {
                    for (const keys of Object.values(plan)) {
                        const index = keys.indexOf(key);
                        if (index >= 0) keys[index] = updatedKey;
                    }
                }
                for (const schedule of Object.values(studentState.schedule)) {
                    for (const [slot, courseKey] of Object.entries(schedule)) {
                        if (courseKey === key) schedule[slot] = updatedKey;
                    }
                }
            }
            course.status = status.value;
            course.mark = mark.value.trim();
            course.credits = Number(credits.value) || 0;
            course.requirement = requirement.value;
            saveStudentState();
            renderClasses();
        };
        for (const control of [grade, status, mark, credits, requirement]) {
            control.addEventListener("change", saveRecord);
        }
        controls.append(grade, status, mark, credits, requirement);
        const remove = document.createElement("button");
        remove.className = "button button-quiet";
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
            delete studentState.classes[key];
            for (const plan of Object.values(studentState.maps)) {
                for (const [subjectId, keys] of Object.entries(plan)) {
                    plan[subjectId] = keys.filter((courseKey) => courseKey !== key);
                }
            }
            for (const schedule of Object.values(studentState.schedule)) {
                for (const [slot, courseKey] of Object.entries(schedule)) {
                    if (courseKey === key) delete schedule[slot];
                }
            }
            saveStudentState();
            renderClasses();
        });
        item.append(details, controls, remove);
        list.append(item);
    }
}

function renderProfile() {
    const { profile } = studentState;
    document.querySelector("#profile-current-grade").value = profile.currentGrade || "9";
    document.querySelector("#profile-graduation-year").value = profile.graduationYear || "";
    document.querySelector("#profile-math8-course").value = profile.math8Course || "";
    document.querySelector("#profile-math8-grade").value = profile.math8Grade || "";
    document.querySelector("#class-grade").value = profile.currentGrade || "9";
    fillCoursePicker();
    renderClasses();
}

function openTranscriptDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("pascack-planner-private-files", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("transcripts");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open private file storage."));
    });
}

async function saveTranscript(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
        transcriptStatus.textContent = "That file is over the 15 MB limit.";
        return;
    }
    try {
        const database = await openTranscriptDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction("transcripts", "readwrite");
            transaction.objectStore("transcripts").put({
                blob: file,
                name: file.name,
                size: file.size,
                type: file.type,
                savedAt: new Date().toISOString()
            }, "transcript");
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error("Could not save the transcript."));
            transaction.onabort = () => reject(transaction.error || new Error("Transcript storage was interrupted."));
        });
        database.close();
        await renderTranscriptStatus();
    } catch (error) {
        transcriptStatus.textContent = `Could not save transcript locally: ${error.message}`;
    } finally {
        transcriptInput.value = "";
    }
}

async function renderTranscriptStatus() {
    try {
        const database = await openTranscriptDatabase();
        const stored = await new Promise((resolve, reject) => {
            const request = database.transaction("transcripts").objectStore("transcripts").get("transcript");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not read the saved transcript."));
        });
        database.close();
        removeTranscriptButton.hidden = !stored;
        transcriptStatus.textContent = stored
            ? `Saved on this device: ${stored.name} (${(stored.size / (1024 * 1024)).toFixed(1)} MB). The file is not sent to the school or a server.`
            : "No transcript stored.";
    } catch (error) {
        removeTranscriptButton.hidden = true;
        transcriptStatus.textContent = `Private file storage is unavailable: ${error.message}`;
    }
}

function removeTranscript() {
    openTranscriptDatabase().then((database) => new Promise((resolve, reject) => {
        const transaction = database.transaction("transcripts", "readwrite");
        transaction.objectStore("transcripts").delete("transcript");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not remove the transcript.")); };
    })).then(renderTranscriptStatus).catch((error) => {
        transcriptStatus.textContent = `Could not remove transcript: ${error.message}`;
    });
}

try {
    studentState = StudentPlanner.load();
} catch (error) {
    studentState = StudentPlanner.createState();
    showProfileStatus(error.message, true);
}

for (const program of window.PASCACK_PROGRAMS) {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = program.name;
    subjectPicker.append(option);
}
for (const [id, label] of Object.entries(StudentPlanner.requirementLabels)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    document.querySelector("#class-requirement").append(option);
}
document.querySelector("#class-requirement").insertAdjacentHTML("afterbegin", '<option value="">Not assigned</option>');
document.querySelector("#class-requirement").value = "";
renderProfile();

for (const id of ["profile-current-grade", "profile-graduation-year", "profile-math8-course", "profile-math8-grade"]) {
    document.querySelector(`#${id}`).addEventListener("change", (event) => {
        const field = {
            "profile-current-grade": "currentGrade",
            "profile-graduation-year": "graduationYear",
            "profile-math8-course": "math8Course",
            "profile-math8-grade": "math8Grade"
        }[id];
        studentState.profile[field] = event.target.value.trim();
        if (field === "currentGrade") document.querySelector("#class-grade").value = event.target.value;
        saveStudentState();
    });
}
subjectPicker.addEventListener("change", fillCoursePicker);
document.querySelector("#class-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const course = StudentPlanner.findCourse(subjectPicker.value, coursePicker.value);
    if (!course) {
        showProfileStatus("Choose a course from the selected department.", true);
        return;
    }
    const grade = document.querySelector("#class-grade").value;
    const key = StudentPlanner.courseKey({ ...course, subjectId: subjectPicker.value }, grade);
    const record = {
        key,
        title: course.title,
        subjectId: subjectPicker.value,
        subjectName: window.PASCACK_PROGRAMS.find((item) => item.id === subjectPicker.value).name,
        grade,
        status: document.querySelector("#class-status").value,
        mark: document.querySelector("#class-mark").value.trim(),
        credits: Number(document.querySelector("#class-credits").value) || 0,
        requirement: document.querySelector("#class-requirement").value
    };
    studentState.classes[key] = record;
    saveStudentState();
    renderClasses();
    document.querySelector("#class-mark").value = "";
});

transcriptInput.addEventListener("change", () => saveTranscript(transcriptInput.files[0]));
removeTranscriptButton.addEventListener("click", removeTranscript);
renderTranscriptStatus();
