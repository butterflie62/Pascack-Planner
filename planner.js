const SUPABASE_URL = window.PASCACK_SUPABASE_CONFIG?.url;
const SUPABASE_ANON_KEY = window.PASCACK_SUPABASE_CONFIG?.anonKey;
const TRANSCRIPT_BUCKET = "student-transcripts";
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_PAGES = 30;

const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authStatus = document.querySelector("#auth-status");
const plannerApp = document.querySelector("#planner-app");
const planStatus = document.querySelector("#plan-status");
const currentGradeSelect = document.querySelector("#current-grade");
const yearPlanGrid = document.querySelector("#year-plan-grid");
const quickClassForm = document.querySelector("#quick-class-form");
const quickSubjectSelect = document.querySelector("#quick-subject");
const quickCourseSelect = document.querySelector("#quick-course");
const quickGradeSelect = document.querySelector("#quick-grade");
const quickStatusSelect = document.querySelector("#quick-status");
const requirementProgress = document.querySelector("#requirement-progress");
const suggestedCourseList = document.querySelector("#suggested-course-list");
const recommendationCopy = document.querySelector("#recommendation-copy");
const transcriptFileInput = document.querySelector("#transcript-file");
const transcriptStatus = document.querySelector("#transcript-status");
const transcriptReview = document.querySelector("#transcript-review");
const transcriptMatchesElement = document.querySelector("#transcript-matches");
const transcriptStorageConsent = document.querySelector("#transcript-storage-consent");
const signInButton = document.querySelector("#sign-in-button");
const signUpButton = document.querySelector("#sign-up-button");
const googleSignInButton = document.querySelector("#google-sign-in-button");
const savePlanButton = document.querySelector("#save-plan-button");
const deletePlanButton = document.querySelector("#delete-plan-button");
const signOutButton = document.querySelector("#sign-out-button");
const planStorageLabel = document.querySelector("#plan-storage-label");
const accountAccess = document.querySelector(".planner-account-access");
const ACCOUNT_BACKUP_KEY = "pascack-planner-device-draft-v1";

const catalogCourses = (window.PASCACK_PROGRAMS || []).flatMap((program) =>
    program.courses.map((course, index) => ({
        id: `${program.id}:${index}`,
        title: course.title,
        subjectId: program.id,
        subject: program.name,
        grades: course.grades || "",
        prerequisite: course.prerequisite || ""
    }))
);
const coursesById = new Map(catalogCourses.map((course) => [course.id, course]));

let supabaseClient;
let signedInUser;
let currentGrade = 9;
let planCourses = [];
let transcriptPath = null;
let pendingTranscriptFile = null;
let transcriptMatches = [];
let planDirty = false;
let deviceDraftSnapshot;

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
}

function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((byte, index) => {
        const hex = byte.toString(16).padStart(2, "0");
        return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex;
    }).join("");
}

function createCourseRow(course = {}) {
    return {
        id: course.id || newId(),
        grade: Number(course.grade),
        courseId: coursesById.has(course.courseId) ? course.courseId : "",
        customTitle: typeof course.customTitle === "string" ? course.customTitle.slice(0, 160) : "",
        subjectId: typeof course.subjectId === "string" ? course.subjectId : "",
        source: ["transcript", "manual"].includes(course.source) ? course.source : "planned",
        status: ["planned", "current", "completed"].includes(course.status)
            ? course.status
            : course.source === "transcript" ? "completed" : "planned",
        mark: typeof course.mark === "string" ? course.mark.slice(0, 12) : "",
        credits: Number.isFinite(Number(course.credits)) ? Number(course.credits) : 5,
        requirement: typeof course.requirement === "string" ? course.requirement : ""
    };
}

function normalizeText(text) {
    return text
        .toLocaleLowerCase()
        .replace(/advanced placement/g, "ap")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function courseAliases(course) {
    const aliases = new Set([course.title]);
    for (const part of course.title.split(/[\/,]/)) {
        if (part.trim().length >= 8) aliases.add(part.trim());
    }
    return [...aliases]
        .map(normalizeText)
        .filter((alias) => alias.length >= 5)
        .sort((left, right) => right.length - left.length);
}

async function extractTextFromPdf(file) {
    if (!window.pdfjsLib) {
        throw new Error("The PDF reader could not load. Check your internet connection and reload the page.");
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const data = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    try {
        if (pdf.numPages > MAX_TRANSCRIPT_PAGES) {
            throw new Error(`This PDF has ${pdf.numPages} pages. Upload a transcript with ${MAX_TRANSCRIPT_PAGES} pages or fewer.`);
        }

        const lines = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const positionedItems = content.items
                .filter((item) => typeof item.str === "string" && item.str.trim())
                .map((item) => ({
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5]
                }))
                .sort((left, right) => right.y - left.y || left.x - right.x);
            const pageLines = [];
            for (const item of positionedItems) {
                let line = pageLines[pageLines.length - 1];
                if (!line || Math.abs(line.y - item.y) > 3) {
                    line = { y: item.y, items: [] };
                    pageLines.push(line);
                }
                line.items.push(item);
            }
            let activeGrade = null;
            for (const line of pageLines) {
                line.items.sort((left, right) => left.x - right.x);
                const text = line.items.map((item) => item.text).join(" ").trim();
                const explicitGrade = gradeFromText(text);
                if (explicitGrade) activeGrade = explicitGrade;
                lines.push({ text, grade: explicitGrade || activeGrade, pageNumber });
            }
        }
        return { lines, text: lines.map((line) => line.text).join(" ") };
    } finally {
        await pdf.destroy();
    }
}

function gradeFromText(text) {
    const namedGrade = text.match(/\b(freshman|sophomore|junior|senior)\b/i);
    if (namedGrade) {
        return {
            freshman: 9,
            sophomore: 10,
            junior: 11,
            senior: 12
        }[namedGrade[1].toLocaleLowerCase()];
    }

    const gradeMatch = text.match(/\b(?:grade|gr\.?|year)\s*[:#-]?\s*(0?[9]|1[0-2])(?:th)?\b/i);
    return gradeMatch ? Number(gradeMatch[1]) : null;
}

function findTranscriptMatches(lines) {
    const normalizedLines = lines.map((line) => ({
        text: normalizeText(line.text),
        grade: line.grade
    })).filter((line) => line.text);
    const matchesByCourseAndGrade = new Map();

    for (const line of normalizedLines) {
        let bestMatch = null;
        let bestAliasLength = 0;
        for (const course of catalogCourses) {
            for (const alias of courseAliases(course)) {
                if (alias.length > bestAliasLength && line.text.includes(alias)) {
                    bestMatch = course;
                    bestAliasLength = alias.length;
                }
            }
        }
        if (bestMatch) {
            const grade = Number.isInteger(line.grade) ? line.grade : null;
            const key = `${bestMatch.id}:${grade ?? "unknown"}`;
            if (!matchesByCourseAndGrade.has(key)) {
                matchesByCourseAndGrade.set(key, {
                    id: newId(),
                    courseId: bestMatch.id,
                    grade
                });
            }
        }
    }
    return [...matchesByCourseAndGrade.values()];
}

function addCourseSelect(row, locked, onCourseChange) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Course for grade ${row.grade}`);
    select.disabled = locked;

    const prompt = document.createElement("option");
    prompt.value = "";
    prompt.textContent = "Choose a course";
    select.append(prompt);

    const groups = new Map();
    for (const course of catalogCourses) {
        if (!groups.has(course.subject)) groups.set(course.subject, []);
        groups.get(course.subject).push(course);
    }
    for (const [subject, courses] of groups) {
        const group = document.createElement("optgroup");
        group.label = subject;
        for (const course of courses) {
            const option = document.createElement("option");
            option.value = course.id;
            option.textContent = course.title;
            group.append(option);
        }
        select.append(group);
    }

    const customOption = document.createElement("option");
    customOption.value = "__custom";
    customOption.textContent = "Other / custom course";
    select.append(customOption);
    select.value = row.customTitle ? "__custom" : row.courseId;
    select.addEventListener("change", () => {
        row.courseId = select.value === "__custom" ? "" : select.value;
        row.customTitle = select.value === "__custom" ? row.customTitle : "";
        row.subjectId = coursesById.get(row.courseId)?.subjectId || row.subjectId;
        customInput.hidden = select.value !== "__custom";
        onCourseChange();
        setDirty();
    });

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.maxLength = 160;
    customInput.placeholder = "Enter course title";
    customInput.value = row.customTitle;
    customInput.setAttribute("aria-label", `Custom course title for grade ${row.grade}`);
    customInput.hidden = !row.customTitle;
    customInput.disabled = locked;
    customInput.addEventListener("input", () => {
        row.customTitle = customInput.value;
        onCourseChange();
        setDirty();
    });

    const field = document.createElement("div");
    field.className = "sheet-course-field";
    field.append(select, customInput);
    return field;
}

function populateCourseOptions(subjectSelect, courseSelect) {
    const previousSubject = subjectSelect.value;
    subjectSelect.replaceChildren();
    for (const program of window.PASCACK_PROGRAMS || []) {
        const option = document.createElement("option");
        option.value = program.id;
        option.textContent = program.name;
        subjectSelect.append(option);
    }
    if ([...subjectSelect.options].some((option) => option.value === previousSubject)) {
        subjectSelect.value = previousSubject;
    }

    const program = window.PASCACK_PROGRAMS.find((item) => item.id === subjectSelect.value);
    courseSelect.replaceChildren();
    for (const [index, course] of (program?.courses || []).entries()) {
        const option = document.createElement("option");
        option.value = `${program.id}:${index}`;
        option.textContent = course.title;
        courseSelect.append(option);
    }
}

function rowCourse(row) {
    const catalogCourse = coursesById.get(row.courseId);
    if (catalogCourse) return catalogCourse;
    return row.customTitle
        ? { title: row.customTitle, subjectId: row.subjectId || "other-programs", subject: "Custom course", prerequisite: "" }
        : null;
}

function requirementForCourse(course) {
    return StudentPlanner.requirementForCourse(course.subjectId, course.title);
}

function normalizedCourseText(value) {
    return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function subjectIdsInPrerequisite(text) {
    const rules = [
        { pattern: /english|language arts/, id: "english" },
        { pattern: /history|social studies/, id: "social-studies" },
        { pattern: /math|algebra|geometry/, id: "mathematics" },
        { pattern: /science|biology|chemistry|physics/, id: "science" },
        { pattern: /world language|spanish|french|italian|chinese/, id: "world-languages" },
        { pattern: /\bart\b|studio/, id: "art" }
    ];
    return rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
}

function prerequisiteSatisfied(course) {
    const prerequisite = normalizedCourseText(course.prerequisite);
    if (!prerequisite) return false;
    const earlierClasses = planCourses
        .map((row) => ({ row, course: rowCourse(row) }))
        .filter(({ row, course: prior }) =>
            prior && Number(row.grade) < currentGrade && ["completed", "current"].includes(row.status)
        );
    const gradeReferences = [...prerequisite.matchAll(/\b(\d+)(?:st|nd|rd|th)\s*grade\b/g)];
    if (gradeReferences.length) {
        for (let index = 0; index < gradeReferences.length; index += 1) {
            const reference = gradeReferences[index];
            const end = gradeReferences[index + 1]?.index ?? prerequisite.length;
            const requirementText = prerequisite.slice(reference.index, end).split(";")[0];
            const subjects = subjectIdsInPrerequisite(requirementText);
            if (!subjects.length || Number(reference[1]) >= currentGrade) return false;
            for (const subjectId of subjects) {
                if (!earlierClasses.some(({ row, course: prior }) =>
                    row.grade === Number(reference[1]) && prior.subjectId === subjectId
                )) return false;
            }
        }
        return true;
    }

    if (/\band\b|,|;/.test(prerequisite) || /audition|placement|recommendation|portfolio|average|proficiency/.test(prerequisite)) {
        return false;
    }
    return earlierClasses.some(({ course: prior }) => {
        const title = normalizedCourseText(prior.title);
        return title.length > 5 && prerequisite.includes(title);
    });
}

function commonStartingCourses() {
    const commonCourses = {
        9: [["english", /^english i\b/i], ["social-studies", /^world history$/i], ["science", /^biology$/i]],
        10: [["english", /^english ii\b/i], ["social-studies", /^u\. s\. history i$/i], ["science", /^chemistry$/i]],
        11: [["english", /^english iii\b/i], ["social-studies", /^u\. s\. history ii$/i], ["science", /^physics$/i]],
        12: [["english", /^english iv\b/i]]
    };
    return (commonCourses[currentGrade] || []).flatMap(([subjectId, matcher]) => {
        const course = catalogCourses.find((item) =>
            item.subjectId === subjectId && matcher.test(item.title) &&
            item.grades.split(",").map((grade) => grade.trim()).includes(String(currentGrade))
        );
        return course && !planCourses.some((row) => row.courseId === course.id && row.grade === currentGrade)
            ? [{ course, reason: "A common core starting point" }]
            : [];
    });
}

function recommendations() {
    const eligible = catalogCourses.filter((course) =>
        course.grades.split(",").map((grade) => grade.trim()).includes(String(currentGrade)) &&
        course.prerequisite && prerequisiteSatisfied(course) &&
        !planCourses.some((row) => row.courseId === course.id && row.grade === currentGrade)
    );
    const seen = new Set();
    const personalized = eligible.filter((course) => {
        const normalizedTitle = normalizedCourseText(course.title);
        if (seen.has(normalizedTitle)) return false;
        seen.add(normalizedTitle);
        return true;
    }).slice(0, 3).map((course) => ({ course, reason: "Matches the prerequisites in your plan" }));
    return personalized.length ? { courses: personalized, personalized: true } :
        { courses: commonStartingCourses(), personalized: false };
}

function renderRequirementProgress() {
    requirementProgress.replaceChildren();
    let state;
    try {
        state = StudentPlanner.load();
    } catch (error) {
        const message = document.createElement("p");
        message.className = "planner-copy";
        message.textContent = error.message;
        requirementProgress.append(message);
        return;
    }
    const totals = StudentPlanner.creditTotals(state);
    const total = document.createElement("p");
    total.className = "requirement-total";
    total.textContent = `${totals.earned.toFixed(1)} earned/current · ${totals.planned.toFixed(1)} planned / 120 credits estimated`;
    requirementProgress.append(total);
    const essential = ["english", "physicalEducation", "mathematics", "science", "socialStudies", "worldLanguages", "arts", "lifeCareers", "financialLiteracy"];
    for (const id of essential) {
        const target = StudentPlanner.requirementTargets[id];
        const progress = totals.requirements[id];
        const achieved = progress.earned + progress.planned;
        const row = document.createElement("div");
        row.className = "requirement-progress-row";
        const label = document.createElement("span");
        label.textContent = StudentPlanner.requirementLabels[id];
        const amount = document.createElement("small");
        amount.textContent = `${achieved.toFixed(1)} / ${target} est. credits`;
        const meter = document.createElement("progress");
        meter.max = target;
        meter.value = Math.min(achieved, target);
        meter.setAttribute("aria-label", `${StudentPlanner.requirementLabels[id]}: ${amount.textContent}`);
        const info = document.createElement("div");
        info.className = "requirement-progress-info";
        info.append(label, amount);
        row.append(info, meter);
        requirementProgress.append(row);
    }
}

function renderRecommendations() {
    suggestedCourseList.replaceChildren();
    const result = recommendations();
    recommendationCopy.textContent = result.personalized
        ? "These catalog options match prerequisites in the classes you entered."
        : "Add completed/current courses above to unlock suggestions based on your own prerequisites. These common starting points are just examples.";
    if (!result.courses.length) {
        const message = document.createElement("p");
        message.className = "planner-copy";
        message.textContent = "Your schedule already includes these starting points. Browse the catalog to find electives or other pathways.";
        suggestedCourseList.append(message);
        return;
    }
    for (const { course, reason } of result.courses) {
        const card = document.createElement("article");
        card.className = "suggested-course-card";
        const subject = document.createElement("span");
        subject.className = "suggested-course-subject";
        subject.textContent = course.subject;
        const title = document.createElement("h4");
        title.textContent = course.title;
        const note = document.createElement("p");
        note.textContent = reason;
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Why this course?";
        const prerequisite = document.createElement("p");
        prerequisite.textContent = course.prerequisite
            ? `Catalog prerequisite: ${course.prerequisite}`
            : "No prerequisite is listed in the catalog.";
        details.append(summary, prerequisite);
        const add = document.createElement("button");
        add.type = "button";
        add.className = "button button-outline";
        add.textContent = "Add to my schedule";
        add.addEventListener("click", () => {
            planCourses.push(createCourseRow({
                grade: currentGrade,
                courseId: course.id,
                source: "planned",
                status: "planned",
                requirement: requirementForCourse(course)
            }));
            renderPlan();
            setDirty();
        });
        card.append(subject, title, note, details, add);
        suggestedCourseList.append(card);
    }
}

function setDirty(message = "Unsaved changes.") {
    planDirty = true;
    try {
        StudentPlanner.saveSchedulePlan(currentGrade, planCourses);
        setStatus(planStatus, signedInUser
            ? `${message} Your latest draft is also saved on this device. Save plan to sync it to your account.`
            : "Draft saved on this device. Sign in only if you want to sync it across devices.");
    } catch (error) {
        setStatus(planStatus, error.message, true);
    }
    renderRequirementProgress();
    renderRecommendations();
}

function renderPlan() {
    yearPlanGrid.replaceChildren();
    for (let grade = 9; grade <= 12; grade += 1) {
        const history = grade < currentGrade;
        const heading = document.createElement("tr");
        heading.className = "year-plan-group-row";
        const headingCell = document.createElement("th");
        headingCell.scope = "rowgroup";
        headingCell.colSpan = 5;
        headingCell.textContent = `Grade ${grade}`;
        const badge = document.createElement("span");
        badge.className = `year-plan-badge${history ? " is-history" : ""}`;
        badge.textContent = history ? "Transcript history" : grade === currentGrade ? "Current year" : "Plan ahead";
        headingCell.append(badge);
        heading.append(headingCell);
        yearPlanGrid.append(heading);

        const coursesForYear = planCourses.filter((course) => course.grade === grade);
        if (!coursesForYear.length) {
            const emptyRow = document.createElement("tr");
            const empty = document.createElement("td");
            empty.className = "sheet-empty";
            empty.textContent = history ? "No courses imported for this year." : "Add courses to start planning.";
            empty.colSpan = 5;
            emptyRow.append(empty);
            yearPlanGrid.append(emptyRow);
        }

        for (const course of coursesForYear) {
            const row = document.createElement("tr");
            row.className = "year-plan-course-row";
            const courseCell = document.createElement("td");
            courseCell.className = "year-plan-course-cell";
            const subjectCell = document.createElement("td");
            const catalogCourse = coursesById.get(course.courseId);
            subjectCell.textContent = catalogCourse?.subject || (course.customTitle ? "Custom course" : "Choose a course");
            courseCell.append(addCourseSelect(course, false, () => {
                const selectedCourse = coursesById.get(course.courseId);
                subjectCell.textContent = selectedCourse?.subject || (course.customTitle ? "Custom course" : "Choose a course");
            }));

            const gradeCell = document.createElement("td");
            const gradeSelect = document.createElement("select");
            gradeSelect.className = "plan-grade-select";
            gradeSelect.setAttribute("aria-label", `Grade for ${catalogCourse?.title || course.customTitle || "course"}`);
            for (let courseGrade = 9; courseGrade <= 12; courseGrade += 1) {
                const option = document.createElement("option");
                option.value = String(courseGrade);
                option.textContent = `Grade ${courseGrade}`;
                gradeSelect.append(option);
            }
            gradeSelect.value = String(grade);
            gradeSelect.addEventListener("change", () => {
                course.grade = Number(gradeSelect.value);
                renderPlan();
                setDirty();
            });
            gradeCell.append(gradeSelect);

            const sourceCell = document.createElement("td");
            const statusSelect = document.createElement("select");
            statusSelect.className = "plan-status-select";
            statusSelect.setAttribute("aria-label", `Status for ${catalogCourse?.title || course.customTitle || "course"}`);
            for (const [value, label] of [
                ["completed", "Completed"],
                ["current", "Taking now"],
                ["planned", "Plan to take"]
            ]) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                statusSelect.append(option);
            }
            statusSelect.value = course.status;
            statusSelect.addEventListener("change", () => {
                course.status = statusSelect.value;
                if (course.status === "completed" && course.source === "planned") course.source = "manual";
                renderPlan();
                setDirty();
            });
            sourceCell.append(statusSelect);
            if (course.source === "transcript") {
                const source = document.createElement("small");
                source.className = "sheet-source";
                source.textContent = "Transcript";
                sourceCell.append(source);
            }

            const removeButton = document.createElement("button");
            removeButton.className = "sheet-remove";
            removeButton.type = "button";
            removeButton.textContent = "Remove";
            removeButton.setAttribute("aria-label", `Remove course from grade ${grade}`);
            removeButton.addEventListener("click", () => {
                planCourses = planCourses.filter((item) => item.id !== course.id);
                renderPlan();
                setDirty();
            });
            const actionCell = document.createElement("td");
            actionCell.append(removeButton);
            row.append(courseCell, gradeCell, subjectCell, sourceCell, actionCell);
            yearPlanGrid.append(row);
        }

        if (!history) {
            const addButton = document.createElement("button");
            addButton.className = "sheet-add";
            addButton.type = "button";
            addButton.textContent = "+ Add a course";
            addButton.addEventListener("click", () => {
                planCourses.push(createCourseRow({
                    grade,
                    source: "planned",
                    status: grade === currentGrade ? "current" : "planned"
                }));
                renderPlan();
                setDirty();
            });
            const addRow = document.createElement("tr");
            const addCell = document.createElement("td");
            addCell.colSpan = 5;
            addCell.append(addButton);
            addRow.append(addCell);
            yearPlanGrid.append(addRow);
        }
    }
    renderRequirementProgress();
    renderRecommendations();
}

function addQuickClass(event) {
    event.preventDefault();
    const course = coursesById.get(quickCourseSelect.value);
    if (!course) {
        setStatus(planStatus, "Choose a course before adding it.", true);
        return;
    }

    const grade = Number(quickGradeSelect.value);
    if (planCourses.some((row) => row.courseId === course.id && row.grade === grade)) {
        setStatus(planStatus, `${course.title} is already in your Grade ${grade} plan.`);
        return;
    }

    planCourses.push(createCourseRow({
        grade,
        courseId: course.id,
        subjectId: course.subjectId,
        source: "manual",
        status: quickStatusSelect.value,
        requirement: requirementForCourse(course)
    }));
    renderPlan();
    setDirty(`${course.title} added to Grade ${grade}.`);
    quickClassForm.reset();
    quickSubjectSelect.value = course.subjectId;
    populateCourseOptions(quickSubjectSelect, quickCourseSelect);
    quickCourseSelect.value = course.id;
    quickGradeSelect.value = String(currentGrade);
    quickStatusSelect.value = "completed";
}

function renderTranscriptMatches() {
    transcriptMatchesElement.replaceChildren();
    for (const match of transcriptMatches) {
        const row = document.createElement("div");
        row.className = "transcript-match-row";

        const courseSelect = document.createElement("select");
        courseSelect.setAttribute("aria-label", "Matched transcript course");
        const groupedCourses = new Map();
        for (const course of catalogCourses) {
            if (!groupedCourses.has(course.subject)) groupedCourses.set(course.subject, []);
            groupedCourses.get(course.subject).push(course);
        }
        for (const [subject, courses] of groupedCourses) {
            const group = document.createElement("optgroup");
            group.label = subject;
            for (const course of courses) {
                const option = document.createElement("option");
                option.value = course.id;
                option.textContent = course.title;
                group.append(option);
            }
            courseSelect.append(group);
        }
        courseSelect.value = match.courseId;
        courseSelect.addEventListener("change", () => {
            match.courseId = courseSelect.value;
        });

        const gradeSelect = document.createElement("select");
        gradeSelect.setAttribute("aria-label", `Grade for ${coursesById.get(match.courseId)?.title || "matched course"}`);
        for (let grade = 9; grade <= 12; grade += 1) {
            const option = document.createElement("option");
            option.value = String(grade);
            option.textContent = `Grade ${grade}`;
            gradeSelect.append(option);
        }
        const gradePrompt = document.createElement("option");
        gradePrompt.value = "";
        gradePrompt.textContent = "Select grade";
        gradeSelect.prepend(gradePrompt);
        gradeSelect.value = match.grade ? String(match.grade) : "";
        gradeSelect.addEventListener("change", () => {
            match.grade = Number(gradeSelect.value);
            gradeSelect.setAttribute("aria-label", `Grade for ${coursesById.get(match.courseId)?.title || "matched course"}`);
        });

        const removeButton = document.createElement("button");
        removeButton.className = "sheet-remove";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", "Remove detected course");
        removeButton.addEventListener("click", () => {
            transcriptMatches = transcriptMatches.filter((item) => item.id !== match.id);
            renderTranscriptMatches();
        });

        row.append(courseSelect, gradeSelect, removeButton);
        transcriptMatchesElement.append(row);
    }
}

async function loadPlan() {
    setStatus(planStatus, "Loading your saved plan…");
    let response;
    try {
        response = await supabaseClient
            .from("student_plans")
            .select("current_grade,courses,transcript_path")
            .eq("user_id", signedInUser.id)
            .maybeSingle();
    } catch (error) {
        setStatus(planStatus, `Could not load your plan: ${error.message || "network request failed"}`, true);
        renderPlan();
        return;
    }
    const { data, error } = response;

    if (error) {
        setStatus(planStatus, `Could not load your plan: ${error.message}`, true);
        renderPlan();
        return;
    }

    if (data) {
        const savedGrade = Number(data.current_grade);
        if (!Number.isInteger(savedGrade) || savedGrade < 9 || savedGrade > 12 || !Array.isArray(data.courses)) {
            setStatus(planStatus, "The saved plan has invalid data. Contact the site administrator before editing it.", true);
            return;
        }
        const loadedCourses = data.courses.map((course) => createCourseRow(course));
        if (loadedCourses.some((course) => !Number.isInteger(course.grade) || course.grade < 9 || course.grade > 12)) {
            setStatus(planStatus, "The saved plan contains a course with an invalid grade. It was not changed.", true);
            return;
        }
        currentGrade = savedGrade;
        planCourses = loadedCourses;
        transcriptPath = data.transcript_path;
        planDirty = false;
        try {
            StudentPlanner.saveSchedulePlan(currentGrade, planCourses);
        } catch (error) {
            setStatus(planStatus, `Your account plan loaded, but the device draft could not be updated: ${error.message}`, true);
            renderPlan();
            return;
        }
        setStatus(planStatus, "Your saved plan is up to date.");
    } else {
        planDirty = planCourses.length > 0;
        transcriptPath = null;
        setStatus(planStatus, planDirty
            ? "Your device draft is ready. Save plan to keep it with this account."
            : "Your plan is ready. Changes save on this device automatically.");
    }

    currentGradeSelect.value = String(currentGrade);
    quickGradeSelect.value = String(currentGrade);
    renderPlan();
}

function showSignedInState(user) {
    if (!signedInUser) {
        const draft = localStorage.getItem(StudentPlanner.STORAGE_KEY);
        if (draft && !localStorage.getItem(ACCOUNT_BACKUP_KEY)) {
            localStorage.setItem(ACCOUNT_BACKUP_KEY, draft);
        }
    }
    signedInUser = user;
    accountAccess.hidden = true;
    signOutButton.hidden = false;
    deletePlanButton.hidden = false;
    planStorageLabel.textContent = "Signed in · save to sync your plan";
    document.querySelector("#signed-in-email").textContent = user.email || "Signed in";
    loadPlan();
}

function showSignedOutState() {
    signedInUser = null;
    accountAccess.hidden = false;
    accountAccess.open = false;
    signOutButton.hidden = true;
    deletePlanButton.hidden = true;
    planStorageLabel.textContent = "Private draft on this device";
    document.querySelector("#signed-in-email").textContent = "No account needed to explore and edit this plan.";
    const savedDeviceDraft = localStorage.getItem(ACCOUNT_BACKUP_KEY);
    let restoreError;
    if (savedDeviceDraft && !planDirty) {
        try {
            localStorage.setItem(StudentPlanner.STORAGE_KEY, savedDeviceDraft);
            const draft = StudentPlanner.schedulePlan();
            currentGrade = draft.currentGrade;
            planCourses = draft.courses.map((course) => createCourseRow(course));
        } catch (error) {
            restoreError = `Could not restore the device draft: ${error.message}`;
        }
    } else if (savedDeviceDraft) {
        planCourses = planCourses.map((course) => createCourseRow(course));
    } else {
        try {
            const draft = StudentPlanner.schedulePlan();
            currentGrade = draft.currentGrade;
            planCourses = draft.courses.map((course) => createCourseRow(course));
        } catch (error) {
            restoreError = `Could not load the device draft: ${error.message}`;
        }
    }
    localStorage.removeItem(ACCOUNT_BACKUP_KEY);
    transcriptPath = null;
    pendingTranscriptFile = null;
    transcriptMatches = [];
    planDirty = false;
    transcriptFileInput.value = "";
    transcriptStorageConsent.checked = false;
    transcriptReview.hidden = true;
    currentGradeSelect.value = String(currentGrade);
    quickGradeSelect.value = String(currentGrade);
    renderPlan();
    setStatus(planStatus, restoreError || "Draft saved on this device. Sign in only if you want to sync it across devices.", Boolean(restoreError));
}

async function handleAuth(mode) {
    if (!authForm.reportValidity()) return;
    if (!supabaseClient) {
        setStatus(authStatus, "Sign-in is not configured yet. Add the Supabase project URL and public anon key, then enable Google in Supabase Auth.", true);
        return;
    }

    const email = document.querySelector("#auth-email").value.trim();
    const password = document.querySelector("#auth-password").value;
    setStatus(authStatus, mode === "signup" ? "Creating your account…" : "Signing in…");
    signInButton.disabled = true;
    signUpButton.disabled = true;

    try {
        if (mode === "signup") {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.href }
            });
            if (error) throw error;
            if (data.session) {
                showSignedInState(data.user);
                setStatus(authStatus, "");
            } else {
                setStatus(authStatus, "Account created. Check your email to confirm the address, then sign in.");
            }
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            showSignedInState(data.user);
            setStatus(authStatus, "");
        }
    } catch (error) {
        setStatus(authStatus, error.message || "Account request failed. Please try again.", true);
    } finally {
        signInButton.disabled = false;
        signUpButton.disabled = false;
    }
}

async function handleGoogleSignIn() {
    if (!supabaseClient) {
        setStatus(authStatus, "Google sign-in is not configured yet. Add the Supabase project URL and public anon key, then enable Google in Supabase Auth.", true);
        return;
    }

    googleSignInButton.disabled = true;
    setStatus(authStatus, "Redirecting to Google…");
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: new URL("./planner.html", window.location.href).toString()
            }
        });
        if (error) throw error;
    } catch (error) {
        setStatus(authStatus, `Google sign-in failed: ${error.message || "request failed"}`, true);
        googleSignInButton.disabled = false;
    }
}

async function scanTranscript() {
    const file = transcriptFileInput.files?.[0];
    if (!file) {
        setStatus(transcriptStatus, "Choose a PDF transcript first.", true);
        return;
    }
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase().endsWith(".pdf")) {
        setStatus(transcriptStatus, "Please choose a PDF file.", true);
        return;
    }
    if (file.size > MAX_TRANSCRIPT_BYTES) {
        setStatus(transcriptStatus, "The PDF is larger than 10 MB. Choose a smaller file.", true);
        return;
    }

    setStatus(transcriptStatus, "Reading course names in your browser…");
    document.querySelector("#scan-transcript-button").disabled = true;
    transcriptReview.hidden = true;

    try {
        const extracted = await extractTextFromPdf(file);
        if (normalizeText(extracted.text).length < 20) {
            throw new Error("No readable text was found. Scanned/image-only PDFs are not supported; use a text-based PDF.");
        }
        transcriptMatches = findTranscriptMatches(extracted.lines);
        pendingTranscriptFile = file;
        renderTranscriptMatches();
        transcriptReview.hidden = false;
        if (transcriptMatches.length) {
            setStatus(transcriptStatus, `Found ${transcriptMatches.length} possible catalog matches. Check the course and grade for each one.`);
        } else {
            setStatus(transcriptStatus, "No catalog matches were found. You can still add courses manually and save the PDF with your plan.");
        }
    } catch (error) {
        pendingTranscriptFile = null;
        setStatus(transcriptStatus, error.message || "Could not read the PDF.", true);
    } finally {
        document.querySelector("#scan-transcript-button").disabled = false;
    }
}

function importTranscriptMatches() {
    if (!pendingTranscriptFile) {
        setStatus(transcriptStatus, "Read a transcript PDF before importing matches.", true);
        return;
    }
    if (transcriptMatches.some((match) => !Number.isInteger(match.grade))) {
        setStatus(transcriptStatus, "Choose a grade for every match before importing it.", true);
        return;
    }

    for (const match of transcriptMatches) {
        const duplicate = planCourses.some((course) => course.courseId === match.courseId && course.grade === match.grade);
        if (!duplicate) {
            planCourses.push(createCourseRow({
                grade: match.grade,
                courseId: match.courseId,
                source: "transcript"
            }));
        }
    }
    renderPlan();
    transcriptReview.hidden = true;
    setDirty("Transcript matches added. Save your plan to upload the PDF and keep these changes.");
}

async function savePlan() {
    if (!signedInUser) {
        accountAccess.open = true;
        authPanel.focus();
        setStatus(planStatus, "Your draft is already saved on this device. Sign in if you want to save it across devices.");
        return;
    }
    if (pendingTranscriptFile && !transcriptStorageConsent.checked) {
        setStatus(planStatus, "Confirm permission to store the transcript PDF before saving it.", true);
        transcriptStorageConsent.focus();
        return;
    }

    let uploadedPath = null;
    const previousPath = transcriptPath;
    savePlanButton.disabled = true;
    setStatus(planStatus, "Saving your plan…");
    try {
        if (pendingTranscriptFile) {
            uploadedPath = `${signedInUser.id}/${newId()}.pdf`;
            const { error } = await supabaseClient.storage
                .from(TRANSCRIPT_BUCKET)
                .upload(uploadedPath, pendingTranscriptFile, {
                    contentType: "application/pdf",
                    cacheControl: "0",
                    upsert: false
                });
            if (error) throw new Error(`Could not upload the transcript: ${error.message}`);
        }

        const { error } = await supabaseClient.from("student_plans").upsert({
            user_id: signedInUser.id,
            current_grade: currentGrade,
            courses: planCourses.map(({ id, grade, courseId, customTitle, source }) => ({
                ...createCourseRow({ id, grade, courseId, customTitle, source }),
                courseId: courseId || null,
                customTitle: customTitle || null
            })),
            transcript_path: uploadedPath || previousPath,
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
        if (error) {
            if (uploadedPath) {
                const cleanup = await supabaseClient.storage.from(TRANSCRIPT_BUCKET).remove([uploadedPath]);
                if (cleanup.error) {
                    throw new Error(`Could not save your plan: ${error.message}. The new PDF could not be removed: ${cleanup.error.message}`);
                }
            }
            throw new Error(`Could not save your plan: ${error.message}`);
        }

        transcriptPath = uploadedPath || previousPath;
        pendingTranscriptFile = null;
        transcriptFileInput.value = "";
        planDirty = false;
        if (uploadedPath) transcriptStorageConsent.checked = false;
        if (uploadedPath && previousPath) {
            const { error: removeError } = await supabaseClient.storage.from(TRANSCRIPT_BUCKET).remove([previousPath]);
            if (removeError) {
                setStatus(planStatus, `Plan saved, but the previous PDF could not be deleted: ${removeError.message}`, true);
                return;
            }
        }
        setStatus(planStatus, uploadedPath || transcriptPath
            ? "Plan saved. Your transcript PDF is stored in your private account folder."
            : "Plan saved to your account and on this device.");
    } catch (error) {
        setStatus(planStatus, error.message || "Could not save your plan.", true);
    } finally {
        savePlanButton.disabled = false;
    }
}

function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv() {
    const rows = [["Grade", "Course", "Subject", "Status"]];
    for (let grade = 9; grade <= 12; grade += 1) {
        for (const course of planCourses.filter((item) => item.grade === grade)) {
            const catalogCourse = coursesById.get(course.courseId);
            rows.push([
                `Grade ${grade}`,
                catalogCourse?.title || course.customTitle || "",
                catalogCourse?.subject || "",
                course.status === "completed" ? "Completed" :
                    course.status === "current" ? "Taking now" : "Plan to take"
            ]);
        }
    }
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pascack-four-year-plan.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function deletePlan() {
    if (!signedInUser || !window.confirm("Delete your saved plan and its transcript PDF? This cannot be undone.")) return;

    deletePlanButton.disabled = true;
    setStatus(planStatus, "Deleting your plan…");
    try {
        if (transcriptPath) {
            const { error } = await supabaseClient.storage.from(TRANSCRIPT_BUCKET).remove([transcriptPath]);
            if (error) throw new Error(`Could not delete the transcript PDF: ${error.message}`);
        }
        const { error } = await supabaseClient.from("student_plans").delete().eq("user_id", signedInUser.id);
        if (error) throw new Error(`Could not delete your plan: ${error.message}`);

        currentGrade = 9;
        planCourses = [];
        transcriptPath = null;
        pendingTranscriptFile = null;
        planDirty = false;
        transcriptFileInput.value = "";
        transcriptStorageConsent.checked = false;
        currentGradeSelect.value = "9";
        quickGradeSelect.value = "9";
        StudentPlanner.saveSchedulePlan(currentGrade, planCourses);
        localStorage.removeItem(ACCOUNT_BACKUP_KEY);
        renderPlan();
        setStatus(planStatus, "Your saved plan and transcript PDF were deleted.");
    } catch (error) {
        setStatus(planStatus, error.message || "Could not delete your plan.", true);
    } finally {
        deletePlanButton.disabled = false;
    }
}

function initialize() {
    populateCourseOptions(quickSubjectSelect, quickCourseSelect);
    quickGradeSelect.value = String(currentGrade);
    quickStatusSelect.value = "completed";
    try {
        const draft = StudentPlanner.schedulePlan();
        currentGrade = draft.currentGrade;
        planCourses = draft.courses.map((course) => createCourseRow(course));
        currentGradeSelect.value = String(currentGrade);
        quickGradeSelect.value = String(currentGrade);
        setStatus(planStatus, "Draft saved on this device. Sign in only if you want to sync it across devices.");
    } catch (error) {
        setStatus(planStatus, `Could not load the device draft: ${error.message}`, true);
    }
    renderPlan();

    authForm.addEventListener("submit", (event) => {
        event.preventDefault();
        handleAuth("signin");
    });
    signUpButton.addEventListener("click", () => handleAuth("signup"));
    googleSignInButton.addEventListener("click", handleGoogleSignIn);
    quickSubjectSelect.addEventListener("change", () => populateCourseOptions(quickSubjectSelect, quickCourseSelect));
    quickClassForm.addEventListener("submit", addQuickClass);
    currentGradeSelect.addEventListener("change", () => {
        currentGrade = Number(currentGradeSelect.value);
        quickGradeSelect.value = String(currentGrade);
        renderPlan();
        setDirty();
    });
    document.querySelector("#scan-transcript-button").addEventListener("click", scanTranscript);
    transcriptFileInput.addEventListener("change", () => {
        pendingTranscriptFile = null;
        transcriptMatches = [];
        transcriptReview.hidden = true;
        transcriptStorageConsent.checked = false;
        setStatus(transcriptStatus, "");
    });
    document.querySelector("#import-matches-button").addEventListener("click", importTranscriptMatches);
    savePlanButton.addEventListener("click", savePlan);
    document.querySelector("#download-csv-button").addEventListener("click", downloadCsv);
    deletePlanButton.addEventListener("click", deletePlan);
    const openAccountForHash = () => {
        if (window.location.hash === "#auth-panel") {
            accountAccess.open = true;
            authPanel.focus();
        }
    };
    openAccountForHash();
    window.addEventListener("hashchange", openAccountForHash);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
        setStatus(
            authStatus,
            "Sign-in is not configured yet. Add your Supabase project URL and public anon key, apply the SQL migration, and enable Google in Supabase Auth.",
            true
        );
        renderPlan();
        return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    signOutButton.addEventListener("click", async () => {
        if (pendingTranscriptFile && !window.confirm("The selected transcript PDF has not been saved. Sign out and discard the PDF? Your course draft will stay on this device.")) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            setStatus(planStatus, `Could not sign out: ${error.message}`, true);
            return;
        }
        showSignedOutState();
    });

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) {
            setStatus(authStatus, `Could not restore your sign-in: ${error.message}`, true);
            return;
        }
        if (data.session) showSignedInState(data.session.user);
    }).catch((error) => {
        setStatus(authStatus, `Could not restore your sign-in: ${error.message || "request failed"}`, true);
    });

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session?.user && !signedInUser) showSignedInState(session.user);
    });
}

initialize();
