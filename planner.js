const SUPABASE_URL = window.PASCACK_SUPABASE_CONFIG?.url;
const SUPABASE_ANON_KEY = window.PASCACK_SUPABASE_CONFIG?.anonKey;
const TRANSCRIPT_BUCKET = "student-transcripts";
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_PAGES = 30;
const INITIAL_SLOTS_PER_GRADE = 8;

const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authStatus = document.querySelector("#auth-status");
const plannerApp = document.querySelector("#planner-app");
const planStatus = document.querySelector("#plan-status");
const currentGradeSelect = document.querySelector("#current-grade");
const yearPlanGrid = document.querySelector("#year-plan-grid");
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

const catalogCourses = (window.PASCACK_PROGRAMS || []).flatMap((program) =>
    program.courses.map((course, index) => ({
        id: `${program.id}:${index}`,
        title: course.title,
        subjectId: program.id,
        subject: program.name
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
const historyEditGrades = new Set();

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
        source: course.source === "transcript" ? "transcript" : "planned",
        extraSlot: course.extraSlot === true
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

function addCourseSelect(row, locked, slotNumber, onCourseChange) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Course slot ${slotNumber} for grade ${row.grade}`);
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
        customInput.hidden = select.value !== "__custom";
        onCourseChange();
        setDirty();
    });

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.maxLength = 160;
    customInput.placeholder = "Enter course title";
    customInput.value = row.customTitle;
    customInput.setAttribute("aria-label", `Custom course title for grade ${row.grade}, slot ${slotNumber}`);
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

function setDirty(message = "Unsaved changes.") {
    planDirty = true;
    setStatus(planStatus, message);
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
        if (history) {
            const editButton = document.createElement("button");
            const isEditing = historyEditGrades.has(grade);
            editButton.className = "button button-outline";
            editButton.type = "button";
            editButton.textContent = isEditing ? "Done editing" : "Edit courses";
            editButton.setAttribute("aria-label", `${isEditing ? "Finish editing" : "Edit"} Grade ${grade} courses`);
            editButton.addEventListener("click", () => {
                if (isEditing) historyEditGrades.delete(grade);
                else historyEditGrades.add(grade);
                renderPlan();
            });
            headingCell.append(editButton);
        }
        heading.append(headingCell);
        yearPlanGrid.append(heading);

        const coursesForYear = planCourses.filter((course) => course.grade === grade);
        const regularCourses = coursesForYear.filter((course) => !course.extraSlot);
        const extraSlots = coursesForYear.filter((course) => course.extraSlot);
        const slotsForYear = [...regularCourses];
        const initialSlotCount = Math.max(INITIAL_SLOTS_PER_GRADE, regularCourses.length);
        const isEditingHistory = history && historyEditGrades.has(grade);
        while ((!history || isEditingHistory) && slotsForYear.length < initialSlotCount) {
            slotsForYear.push(createCourseRow({ grade, source: "planned" }));
        }
        slotsForYear.push(...extraSlots);
        const visibleSlots = history && !isEditingHistory
            ? slotsForYear.filter((course) => course.courseId || course.customTitle)
            : slotsForYear;
        const locked = history && !isEditingHistory;

        for (const [index, course] of visibleSlots.entries()) {
            const row = document.createElement("tr");
            row.className = "year-plan-course-row";
            const isStoredSlot = planCourses.includes(course);
            const isEmptySlot = !course.courseId && !course.customTitle;
            const courseCell = document.createElement("td");
            courseCell.className = "year-plan-course-cell";
            const subjectCell = document.createElement("td");
            const catalogCourse = coursesById.get(course.courseId);
            subjectCell.textContent = catalogCourse?.subject || (course.customTitle ? "Custom course" : "—");
            courseCell.append(addCourseSelect(course, locked, index + 1, () => {
                if (!planCourses.includes(course) && (course.courseId || course.customTitle)) {
                    planCourses.push(course);
                }
                const selectedCourse = coursesById.get(course.courseId);
                subjectCell.textContent = selectedCourse?.subject || (course.customTitle ? "Custom course" : "—");
            }));

            const gradeCell = document.createElement("td");
            const gradeSelect = document.createElement("select");
            gradeSelect.className = "plan-grade-select";
            gradeSelect.setAttribute("aria-label", `Grade for ${catalogCourse?.title || course.customTitle || "course"}`);
            gradeSelect.disabled = locked || isEmptySlot;
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
            const source = document.createElement("span");
            source.className = "sheet-source";
            source.textContent = isEmptySlot ? "Open slot" : course.source === "transcript" ? "Transcript match" : "Planned";
            sourceCell.append(source);

            const actionCell = document.createElement("td");
            if (isStoredSlot) {
                const removeButton = document.createElement("button");
                removeButton.className = "sheet-remove";
                removeButton.type = "button";
                removeButton.textContent = "Remove";
                removeButton.disabled = locked;
                removeButton.setAttribute("aria-label", `Remove course slot ${index + 1} from grade ${grade}`);
                removeButton.addEventListener("click", () => {
                    planCourses = planCourses.filter((item) => item.id !== course.id);
                    renderPlan();
                    setDirty();
                });
                actionCell.append(removeButton);
            }
            row.append(courseCell, gradeCell, subjectCell, sourceCell, actionCell);
            yearPlanGrid.append(row);
        }

        const addButton = document.createElement("button");
        addButton.className = "sheet-add";
        addButton.type = "button";
        addButton.textContent = "+ Add another slot";
        addButton.disabled = locked;
        addButton.addEventListener("click", () => {
            planCourses.push(createCourseRow({ grade, source: "planned", extraSlot: true }));
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
        planCourses = [];
        transcriptPath = null;
        return;
    }
    const { data, error } = response;

    if (error) {
        setStatus(planStatus, `Could not load your plan: ${error.message}`, true);
        planCourses = [];
        transcriptPath = null;
        return;
    }

    if (data) {
        currentGrade = Number(data.current_grade);
        if (!Number.isInteger(currentGrade) || currentGrade < 9 || currentGrade > 12 || !Array.isArray(data.courses)) {
            setStatus(planStatus, "The saved plan has invalid data. Contact the site administrator before editing it.", true);
            return;
        }
        planCourses = data.courses.map((course) => createCourseRow(course)).filter((course) =>
            Number.isInteger(course.grade) && course.grade >= 9 && course.grade <= 12
        );
        transcriptPath = data.transcript_path;
        planDirty = false;
        setStatus(planStatus, "Your saved plan is up to date.");
    } else {
        currentGrade = 9;
        planCourses = [];
        transcriptPath = null;
        planDirty = false;
        setStatus(planStatus, "Start a plan by choosing your current grade or importing a transcript.");
    }

    currentGradeSelect.value = String(currentGrade);
    renderPlan();
}

function showSignedInState(user) {
    signedInUser = user;
    authPanel.hidden = true;
    plannerApp.hidden = false;
    document.querySelector("#signed-in-email").textContent = user.email || "Signed in";
    loadPlan();
}

function showSignedOutState() {
    signedInUser = null;
    plannerApp.hidden = true;
    historyEditGrades.clear();
    authPanel.hidden = false;
    planCourses = [];
    transcriptPath = null;
    pendingTranscriptFile = null;
    transcriptMatches = [];
    planDirty = false;
    transcriptFileInput.value = "";
    transcriptStorageConsent.checked = false;
    transcriptReview.hidden = true;
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
        setStatus(planStatus, "Sign in before saving a plan.", true);
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
            courses: planCourses.map(({ id, grade, courseId, customTitle, source, extraSlot }) => ({
                id,
                grade,
                courseId: courseId || null,
                customTitle: customTitle || null,
                source,
                extraSlot
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
        setStatus(planStatus, "Plan saved. Your transcript PDF is stored in your private account folder.");
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
        for (const course of planCourses.filter((item) => item.grade === grade && (item.courseId || item.customTitle))) {
            const catalogCourse = coursesById.get(course.courseId);
            rows.push([
                `Grade ${grade}`,
                catalogCourse?.title || course.customTitle || "",
                catalogCourse?.subject || "",
                course.source === "transcript" ? "Transcript match" : "Planned"
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
        renderPlan();
        setStatus(planStatus, "Your saved plan and transcript PDF were deleted.");
    } catch (error) {
        setStatus(planStatus, error.message || "Could not delete your plan.", true);
    } finally {
        deletePlanButton.disabled = false;
    }
}

function initialize() {
    authForm.addEventListener("submit", (event) => {
        event.preventDefault();
        handleAuth("signin");
    });
    signUpButton.addEventListener("click", () => handleAuth("signup"));
    googleSignInButton.addEventListener("click", handleGoogleSignIn);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
        setStatus(
            authStatus,
            "Sign-in is not configured yet. Add your Supabase project URL and public anon key, apply the SQL migration, and enable Google in Supabase Auth.",
            true
        );
        return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    document.querySelector("#sign-out-button").addEventListener("click", async () => {
        if ((planDirty || pendingTranscriptFile) && !window.confirm("You have unsaved changes. Sign out and discard them?")) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            setStatus(planStatus, `Could not sign out: ${error.message}`, true);
            return;
        }
        showSignedOutState();
    });
    currentGradeSelect.addEventListener("change", () => {
        currentGrade = Number(currentGradeSelect.value);
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

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) {
            setStatus(authStatus, `Could not restore your sign-in: ${error.message}`, true);
            return;
        }
        if (data.session) showSignedInState(data.session.user);
    });
}

initialize();
