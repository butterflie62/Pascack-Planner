const programGuidance = {
    english: {
        intro: "Read, write, discuss ideas, and explore literature, journalism, theater, and communication.",
        requirement: "English is required every year for all four years of high school.",
        pathway: [
            "Start with English I in grade 9, then continue with the next English course each year.",
            "In grade 11, American Studies may fulfill both the English and U.S. History requirements for that year.",
            "Choose electives that match your interests. Honors and AP placement may have additional requirements."
        ],
        note: "Courses that share a name with regular and Honors versions are shown together. Ask your teacher or counselor which level and grade are right for you."
    },
    "social-studies": {
        intro: "Study history, government, economics, psychology, and how people and communities shape the world.",
        requirement: "Social Studies is required for at least three years. The graduation sequence includes World History, U.S. History, and U.S. History II or an approved equivalent.",
        pathway: [
            "The usual sequence starts with World History, followed by U.S. History I.",
            "For grade 11, take U.S. History II or ask whether American Studies is a good fit.",
            "After required courses, explore electives such as psychology, law, economics, policy, and world issues."
        ],
        note: "American Studies combines English and U.S. History for grade 11. Check with your counselor before selecting it so both subject requirements are covered."
    },
    mathematics: {
        intro: "Build skills in algebra, geometry, calculus, statistics, discrete math, and computer science.",
        requirement: "At least three years of Mathematics are required. Your starting course depends on the math classes you have already completed.",
        pathway: [
            "Math courses build on earlier courses, so check the prerequisite before choosing the next class.",
            "Honors and AP courses can have placement tests, grade expectations, and teacher or supervisor recommendations.",
            "Ask your math teacher or counselor to help map the sequence that matches your current course and goals."
        ],
        note: "There is no single math sequence for every student. Do not skip ahead based only on course names; placement decisions help make sure you have the right preparation."
    },
    science: {
        intro: "Investigate living things, matter, forces, engineering, the environment, and other scientific questions.",
        requirement: "Graduation requires three years of Science, including Biology, Chemistry, and Physics.",
        pathway: [
            "Plan to complete Biology, Chemistry, and Physics to cover the required science areas.",
            "Science classes include laboratory work and build on skills learned in earlier courses.",
            "After or alongside the required sequence, look for electives in engineering, forensics, genetics, astronomy, and more."
        ],
        note: "Honors and AP science classes may expect strong preparation or teacher recommendations. Ask your science teacher which course is a good next step."
    },
    "world-languages": {
        intro: "Learn to understand, speak, read, and write in Chinese, French, Italian, or Spanish.",
        requirement: "At least two years of World Language are required for graduation.",
        pathway: [
            "Choose a language and start at the course level recommended for your experience.",
            "Continue in the same language at the next level to keep building your skills.",
            "Honors, AP, and heritage-speaker courses have specific placement guidance. Ask the language teacher which level fits."
        ],
        note: "The best starting level can depend on previous study or experience speaking the language. Check your placement before selecting a course."
    },
    art: {
        intro: "Make and study visual art through studio work, ceramics, photography, design, and portfolio courses.",
        requirement: "Graduation requires one year of Visual or Performing Arts. Art courses are one way to explore visual arts.",
        pathway: [
            "Studio Art I, Ceramics & Sculpture I, Photography I, and Communication Design offer different ways to begin.",
            "Advanced courses often require the introductory course and, in some areas, teacher approval or a portfolio.",
            "AP art courses focus on making and presenting a body of work. Review each course's expectations before choosing."
        ],
        note: "The advanced art courses are not all open-entry courses. Look at the prerequisite on the course card and ask the art teacher about portfolios or approval."
    },
    "business-education": {
        intro: "Practice money skills and explore business, entrepreneurship, marketing, accounting, leadership, and careers.",
        requirement: "Graduation requires a half-year of Financial Literacy and a year in 21st Century Life and Careers.",
        pathway: [
            "Financial Literacy covers the personal finance requirement; ask which format and term are available.",
            "Explore other business classes based on your interests. Many electives do not require a previous business course.",
            "Some programs, such as the senior internship or Teacher Cadet program, have special grade or application requirements."
        ],
        note: "A course title may sound like a graduation requirement, but not every business course fulfills the same requirement. Confirm how a course will count before selecting it."
    },
    "family-consumer-sciences": {
        intro: "Learn practical skills in cooking, nutrition, clothing, fashion, interior design, and child and family studies.",
        requirement: "These courses can be chosen as electives. Ask your counselor how a course fits with your credit and graduation plan.",
        pathway: [
            "Start with a Level I or introductory course when one is listed.",
            "Advanced courses usually build on the introductory class in the same area.",
            "Use the prerequisite on each course card to see what you need before moving to the next level."
        ],
        note: "Course sequences differ by topic. For example, advanced fashion and clothing courses require the related introductory course."
    },
    "health-physical-education": {
        intro: "Learn about health and wellness and take part in physical education throughout high school.",
        requirement: "Physical Education and Health are required all four years. State rules also set weekly instructional time for physical education and health and safety.",
        pathway: [
            "Plan for the required Physical Education and Health courses each year.",
            "Check your schedule each year to make sure your required credits are included.",
            "Talk with your counselor if you have questions about a specific health or physical education requirement."
        ],
        note: "Health and Physical Education are graduation requirements, not just electives. Your counselor can help confirm they appear in your yearly schedule."
    },
    music: {
        intro: "Explore singing, band, instruments, music technology, popular music, and music theory.",
        requirement: "Music courses may help meet the one-year Visual or Performing Arts graduation requirement.",
        pathway: [
            "Choose a class based on the instrument, ensemble, or music topic you want to explore.",
            "Some ensembles use auditions or teacher recommendations, especially for advanced levels.",
            "Ask the music teacher whether you need experience or an audition for a specific course."
        ],
        note: "Choir, band, and advanced performance courses can have different enrollment steps. Check with the music department before choosing."
    },
    "technology-education": {
        intro: "Design, build, and test ideas through graphic design, architecture, robotics, engineering, and video production.",
        requirement: "These courses can be electives. Ask your counselor how they fit with your graduation requirements and schedule.",
        pathway: [
            "Begin with an introductory course in the area that interests you.",
            "Some advanced courses require an earlier class or a teacher recommendation.",
            "Project-based courses often involve designing, building, testing, and improving your work."
        ],
        note: "A few courses are also listed in other departments. Your counselor can help make sure you have room for the course and that it counts where you need it."
    },
    "special-education": {
        intro: "Find the right support and course plan for your individual learning needs.",
        requirement: "Special Education course and support plans are individualized; there is not one standard course sequence for every student.",
        pathway: [
            "Talk with your school counselor or case manager about the courses and supports in your plan.",
            "Review course choices together so your schedule reflects your learning needs and graduation goals.",
            "Ask the school team if you are unsure which program information applies to you."
        ],
        note: "Course placement and supports are determined with the student and school team. A counselor or case manager can help you find information for your situation."
    },
    "other-programs": {
        intro: "Learn about additional options such as virtual classes, study skills, and specialized programs.",
        requirement: "These options are not all standard electives. Availability and eligibility depend on the program and the student's plan.",
        pathway: [
            "Start by asking your counselor whether the program is available to you.",
            "Review schedule, application, and participation requirements before you make a plan.",
            "Confirm how the program fits your required courses and credits."
        ],
        note: "Some options are designed for particular student needs or require approval. Ask your counselor before planning your schedule around one."
    }
};

const programs = window.PASCACK_PROGRAMS || [];
const params = new URLSearchParams(window.location.search);
const subjectId = params.get("subject");
const program = programs.find((item) => item.id === subjectId);
const guidance = programGuidance[subjectId];

const title = document.querySelector("#program-title");
const intro = document.querySelector("#program-intro");
const search = document.querySelector("#course-search");
const courseGrid = document.querySelector("#course-grid");
const count = document.querySelector("#course-count");
const noCourses = document.querySelector("#no-courses");
const specialMessage = document.querySelector("#special-program-message");

function showUnknownSubject() {
    document.title = "Subject not found | Pascack Planner";
    title.textContent = "Choose a subject to explore";
    intro.textContent = "This subject page could not be found. Return to the subject list to choose a course area.";
    document.querySelector("#planning-title").textContent = "Browse all subjects";
    document.querySelector("#program-requirement").textContent = "Choose a subject to see its courses, prerequisites, and planning tips.";
    document.querySelector("#program-pathway").replaceChildren();
    document.querySelector("#program-note").hidden = true;
    document.querySelector(".course-section").hidden = true;
    document.querySelector(".counselor-callout").hidden = true;
}

function courseLevel(title) {
    const labels = [];
    if (/advanced placement|\bAP\b/i.test(title)) labels.push("AP");
    if (/honors/i.test(title)) labels.push("Honors");
    return labels;
}

function courseCard(course) {
    const card = document.createElement("article");
    card.className = "course-card";

    const badges = document.createElement("div");
    badges.className = "course-badges";
    for (const label of courseLevel(course.title)) {
        const badge = document.createElement("span");
        badge.className = label === "AP" ? "course-badge badge-ap" : "course-badge";
        badge.textContent = label;
        badges.append(badge);
    }
    if (course.grades) {
        const gradeBadge = document.createElement("span");
        gradeBadge.className = "course-badge badge-grade";
        gradeBadge.textContent = `Grades ${course.grades}`;
        badges.append(gradeBadge);
    }

    const heading = document.createElement("h3");
    heading.textContent = course.title;
    card.append(badges, heading);

    const detail = document.createElement("p");
    detail.className = "course-prerequisite";
    if (course.prerequisite) {
        const label = document.createElement("strong");
        label.textContent = "Before you take it: ";
        detail.append(document.createTextNode(course.prerequisite.replace(/[;,.\s]+$/, "")));
        detail.prepend(label);
    } else {
        detail.textContent = "Ask about placement or teacher approval before choosing this course.";
    }
    card.append(detail);
    return card;
}

function renderCourses(query = "") {
    const term = query.trim().toLocaleLowerCase();
    const matches = program.courses.filter((course) => {
        const searchable = `${course.title} ${course.grades} ${course.prerequisite}`.toLocaleLowerCase();
        return searchable.includes(term);
    });

    courseGrid.replaceChildren(...matches.map(courseCard));
    count.textContent = term ? `${matches.length} of ${program.courses.length} courses` : `${program.courses.length} courses`;
    noCourses.hidden = matches.length > 0;
}

if (!program || !guidance) {
    showUnknownSubject();
} else {
    document.title = `${program.name} Courses | Pascack Planner`;
    document.querySelector("#program-kicker").textContent = "Explore this subject";
    title.textContent = program.name;
    intro.textContent = guidance.intro;
    document.querySelector("#program-requirement").textContent = guidance.requirement;
    document.querySelector("#program-pathway").replaceChildren(...guidance.pathway.map((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        return item;
    }));
    document.querySelector("#program-note").textContent = guidance.note;
    search.addEventListener("input", () => renderCourses(search.value));

    if (program.courses.length) {
        renderCourses();
    } else {
        document.querySelector(".course-list-heading").hidden = true;
        specialMessage.hidden = false;
        specialMessage.textContent = "There is no standard course list for this program. Use the planning tips above and talk with your counselor or case manager about the options and supports that fit your situation.";
    }
}
