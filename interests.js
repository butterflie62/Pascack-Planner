const STORAGE_KEY = "pascack-planner-interests-v1";
const interestMatches = {
    make: {
        subjects: ["art", "music", "english", "technology-education"],
        keywords: /art|design|creative|photograph|ceramic|sculpt|music|theater|writing|journal|video|graphic|fashion/i
    },
    solve: {
        subjects: ["mathematics", "science", "technology-education"],
        keywords: /computer|math|calculus|statistics|science|engineering|robot|design|physics|chemistry|biology/i
    },
    people: {
        subjects: ["social-studies", "english", "world-languages"],
        keywords: /history|psychology|sociology|community|culture|government|language|literature|policy/i
    },
    communicate: {
        subjects: ["english", "world-languages", "social-studies"],
        keywords: /english|language|writing|journal|public speaking|theater|literature|culture|communication/i
    },
    business: {
        subjects: ["business-education", "other-programs"],
        keywords: /business|entrepreneur|marketing|account|management|career|teacher|internship/i
    },
    "hands-on": {
        subjects: ["family-consumer-sciences", "technology-education", "art"],
        keywords: /culinary|food|clothing|fashion|interior|design|architecture|robot|video|ceramic|sculpt/i
    },
    perform: {
        subjects: ["music", "english", "health-physical-education"],
        keywords: /choir|band|guitar|theater|dance|physical|health|performance|acting|music/i
    },
    explore: {
        subjects: ["science", "world-languages", "social-studies"],
        keywords: /science|environment|astronomy|world|language|culture|history|community|geography/i
    }
};

const programs = window.PASCACK_PROGRAMS || [];
const checkboxes = [...document.querySelectorAll('input[name="interest"]')];
const resultSection = document.querySelector("#interest-results");
const resultGrid = document.querySelector("#interest-result-grid");
const resultIntro = document.querySelector("#results-intro");
const status = document.querySelector("#interest-save-note");

function saveInterests(values) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        status.textContent = "Your choices are saved in this browser only.";
        return true;
    } catch (error) {
        status.textContent = `Could not save your choices: ${error.message}`;
        return false;
    }
}

function selectedInterests() {
    return checkboxes.filter((input) => input.checked).map((input) => input.value);
}

function createResultCard(program, matchingInterestIds) {
    const card = document.createElement("article");
    card.className = "interest-result-card";

    const heading = document.createElement("h3");
    heading.textContent = program.name;
    const reasons = document.createElement("p");
    reasons.textContent = matchingInterestIds.length === 1
        ? "This subject connects with an interest you picked."
        : "This subject connects with several interests you picked.";

    const keywordRegexes = matchingInterestIds.map((id) => interestMatches[id].keywords);
    const matches = program.courses
        .filter((course) => keywordRegexes.some((regex) => regex.test(course.title)))
        .slice(0, 3);

    const courses = document.createElement("ul");
    courses.className = "interest-course-suggestions";
    for (const course of matches) {
        const item = document.createElement("li");
        item.textContent = course.title;
        courses.append(item);
    }
    if (!matches.length) {
        const item = document.createElement("li");
        item.textContent = "Browse the course list and see what catches your eye.";
        courses.append(item);
    }

    const link = document.createElement("a");
    link.className = "text-link";
    link.href = `./program.html?subject=${encodeURIComponent(program.id)}`;
    link.append(document.createTextNode(`Explore ${program.name} courses `));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    link.append(arrow);

    card.append(heading, reasons, courses, link);
    return card;
}

function showIdeas(values) {
    if (!values.length) {
        resultSection.hidden = true;
        if (saveInterests(values)) status.textContent = "Pick at least one interest to get course ideas.";
        return;
    }

    saveInterests(values);
    const matchingSubjects = new Map();
    for (const id of values) {
        for (const subjectId of interestMatches[id].subjects) {
            matchingSubjects.set(subjectId, [...(matchingSubjects.get(subjectId) || []), id]);
        }
    }

    const cards = programs
        .filter((program) => matchingSubjects.has(program.id) && program.courses.length)
        .map((program) => createResultCard(program, matchingSubjects.get(program.id)));

    resultIntro.textContent = "These are just starting points based on what you selected. Open a subject to browse all its courses.";
    resultGrid.replaceChildren(...cards);
    resultSection.hidden = false;
}

try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.some((value) =>
            typeof value !== "string" || !Object.prototype.hasOwnProperty.call(interestMatches, value)
        )) {
            throw new Error("Saved interests have an unexpected format.");
        }
        for (const checkbox of checkboxes) checkbox.checked = parsed.includes(checkbox.value);
        if (parsed.length) showIdeas(parsed);
    }
} catch (error) {
    status.textContent = `Could not load saved interests: ${error.message}`;
}

document.querySelector("#show-matches").addEventListener("click", () => showIdeas(selectedInterests()));
