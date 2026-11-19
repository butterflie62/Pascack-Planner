const mainCourseSearch = document.querySelector("#main-course-search");
const mainSearchResults = document.querySelector("#main-search-results");
const mainSearchSummary = document.querySelector("#main-search-summary");
const mainSearchList = document.querySelector("#main-search-list");
const programs = window.PASCACK_PROGRAMS || [];

function normalizeCourseSearchText(value) {
    return value
        .toLocaleLowerCase()
        .replace(/advanced placement/g, "ap")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function renderMainCourseSearch(query) {
    const rawTerm = query.trim();
    const term = normalizeCourseSearchText(rawTerm);
    mainSearchList.replaceChildren();

    if (term.length < 2) {
        mainSearchResults.hidden = true;
        mainSearchSummary.textContent = "";
        return;
    }

    const matches = programs.flatMap((program) =>
        program.courses
            .filter((course) => normalizeCourseSearchText(
                `${course.title} ${course.grades} ${course.prerequisite} ${program.name}`
            ).includes(term))
            .map((course) => ({ course, program }))
    );
    const visibleMatches = matches.slice(0, 12);

    mainSearchResults.hidden = false;
    mainSearchSummary.textContent = !matches.length
        ? "No courses found. Try another course or subject."
        : matches.length > visibleMatches.length
            ? `Showing ${visibleMatches.length} of ${matches.length} courses. Refine your search for more specific results.`
            : `${matches.length} ${matches.length === 1 ? "course" : "courses"} found.`;

    if (!matches.length) {
        return;
    }

    for (const { course, program } of visibleMatches) {
        const result = document.createElement("a");
        result.className = "main-search-result";
        result.href = `./program.html?${new URLSearchParams({
            subject: program.id,
            q: course.title
        })}`;

        const title = document.createElement("strong");
        title.textContent = course.title;
        const subject = document.createElement("span");
        subject.textContent = program.name;
        result.append(title, subject);
        mainSearchList.append(result);
    }
}

if (mainCourseSearch && mainSearchResults && mainSearchSummary && mainSearchList) {
    mainCourseSearch.addEventListener("input", () => renderMainCourseSearch(mainCourseSearch.value));
}