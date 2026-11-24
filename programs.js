const programs = window.PASCACK_PROGRAMS || [];
const searchInput = document.querySelector("#catalog-search");
const departmentFilter = document.querySelector("#catalog-department");
const levelFilter = document.querySelector("#catalog-level");
const gradeFilter = document.querySelector("#catalog-grade");
const interestFilter = document.querySelector("#catalog-interest");
const resultsSection = document.querySelector("#catalog-results");
const resultGrid = document.querySelector("#catalog-result-grid");
const resultCount = document.querySelector("#catalog-count");
const noResults = document.querySelector("#catalog-no-results");

const interestKeywords = {
    make: /art|design|creative|photograph|ceramic|sculpt|music|theater|writing|journal|video|graphic|fashion/i,
    solve: /computer|math|calculus|statistics|science|engineering|robot|design|physics|chemistry|biology/i,
    people: /history|psychology|sociology|community|culture|government|language|literature|policy/i,
    communicate: /english|language|writing|journal|public speaking|theater|literature|culture|communication/i,
    business: /business|entrepreneur|marketing|account|management|career|teacher|internship/i,
    "hands-on": /culinary|food|clothing|fashion|interior|design|architecture|robot|video|ceramic|sculpt/i,
    perform: /choir|band|guitar|theater|dance|physical|health|performance|acting|music/i,
    explore: /science|environment|astronomy|world|language|culture|history|community|geography/i
};

function courseLevels(title) {
    const levels = [];
    const variants = title.split("/");
    const hasAP = /advanced placement|\bAP\b/i.test(title);
    const hasHonors = /honors/i.test(title);
    if (hasAP) levels.push("ap");
    if (hasHonors) levels.push("honors");
    if ((!hasAP && !hasHonors) || (hasHonors && variants.length > 1 && variants.some((variant) => !/advanced placement|\bAP\b|honors/i.test(variant)))) {
        levels.push("college-prep");
    }
    return levels;
}

function courseGrades(grades) {
    return (grades || "").split(",").map((grade) => grade.trim()).filter(Boolean);
}

function hasActiveFilters() {
    return Boolean(
        searchInput.value.trim()
        || departmentFilter.value
        || levelFilter.value
        || gradeFilter.value
        || interestFilter.value
    );
}

function matchesCourse(program, course) {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const searchable = `${course.title} ${course.grades} ${course.prerequisite} ${program.name}`.toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (departmentFilter.value && program.id !== departmentFilter.value) return false;
    if (levelFilter.value && !courseLevels(course.title).includes(levelFilter.value)) return false;
    if (gradeFilter.value && !courseGrades(course.grades).includes(gradeFilter.value)) return false;
    if (interestFilter.value && !interestKeywords[interestFilter.value].test(`${course.title} ${program.name}`)) return false;
    return true;
}

function createCourseResult(program, course) {
    const card = document.createElement("article");
    card.className = "catalog-result-card";

    const badges = document.createElement("div");
    badges.className = "course-badges";
    for (const level of courseLevels(course.title)) {
        const badge = document.createElement("span");
        badge.className = `course-badge${level === "ap" ? " badge-ap" : ""}`;
        badge.textContent = level === "ap" ? "AP" : level === "honors" ? "Honors" : "College Prep / Standard";
        badges.append(badge);
    }
    if (course.grades) {
        const badge = document.createElement("span");
        badge.className = "course-badge badge-grade";
        badge.textContent = `Grades ${course.grades}`;
        badges.append(badge);
    }

    const heading = document.createElement("h3");
    heading.textContent = course.title;
    const department = document.createElement("p");
    department.className = "catalog-result-department";
    department.textContent = program.name;
    card.append(badges, heading, department);

    if (course.prerequisite) {
        const prerequisite = document.createElement("p");
        prerequisite.className = "catalog-result-prerequisite";
        prerequisite.textContent = `Prerequisite: ${course.prerequisite}`;
        card.append(prerequisite);
    }

    const link = document.createElement("a");
    link.className = "text-link";
    link.href = `./program.html?subject=${encodeURIComponent(program.id)}`;
    link.textContent = `Explore ${program.name} courses →`;
    card.append(link);
    return card;
}

function renderResults() {
    if (!hasActiveFilters()) {
        resultsSection.hidden = true;
        resultGrid.replaceChildren();
        return;
    }

    const matches = programs.flatMap((program) =>
        program.courses
            .filter((course) => matchesCourse(program, course))
            .map((course) => createCourseResult(program, course))
    );
    resultGrid.replaceChildren(...matches);
    resultCount.textContent = `${matches.length} ${matches.length === 1 ? "course" : "courses"}`;
    noResults.hidden = matches.length > 0;
    resultsSection.hidden = false;
}

for (const program of programs) {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = program.name;
    departmentFilter.append(option);
}

for (const filter of [searchInput, departmentFilter, levelFilter, gradeFilter, interestFilter]) {
    filter.addEventListener(filter === searchInput ? "input" : "change", renderResults);
}

document.querySelector("#catalog-reset").addEventListener("click", () => {
    searchInput.value = "";
    departmentFilter.value = "";
    levelFilter.value = "";
    gradeFilter.value = "";
    interestFilter.value = "";
    renderResults();
    searchInput.focus();
});
