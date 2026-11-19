# Pascack Planner

A student-friendly course-planning website for Pascack Valley Regional High School District.

Students can explore courses on dedicated subject pages, search the full course catalog, check listed grade levels and prerequisites, and review graduation requirements and elective credit categories. The home page links to the separate [Program of Studies](./program-of-studies.html) and [Four-Year Road Map](./road-map.html) pages. After signing in, My Planner provides an editable four-year spreadsheet, PDF transcript matching, and CSV export.

## Set up My Planner

The planner uses Supabase Google OAuth (with email/password as an alternative), a database table with row-level security, and a private Storage bucket. Sign-in and saved plans require a configured Supabase project.

1. Create a Supabase project.
2. Run [`supabase/migrations/20261117000000_student_planner.sql`](./supabase/migrations/20261117000000_student_planner.sql) in the Supabase SQL Editor.
3. Add the project's **Project URL** and **public publishable key** (or legacy anon key) to [`supabase-config.js`](./supabase-config.js). Never put a `service_role` key in this website.
4. In Supabase Auth, enable the Google provider and add its Google OAuth client ID and client secret. Use the callback URL shown by Supabase in Google Cloud, and allow your deployed HTTPS site in Supabase's redirect URL settings. Keep the Google client secret in Supabase only; never put it in this website.
5. Serve the site over localhost for development or HTTPS in production, open `planner.html`, and choose **Continue with Google**. The first sign-in creates a Supabase account; plans and uploaded transcripts are then scoped to that account.

The PDF is read in the browser to suggest matching catalog courses. The original PDF is uploaded to the private Supabase bucket when the student saves the plan. Students must review detected courses and grade assignments; if a grade cannot be read from the transcript, it must be selected before importing. Scanned/image-only PDFs are not supported. The planner stores catalog course selections and custom course titles, and downloads the four-year sheet as CSV. It does not validate course placement, availability, credit totals, or graduation eligibility.

Transcripts are sensitive student records. This sample has account-level access controls, but it is not a district-approved records system. Obtain the necessary school/district, legal, and privacy review before using real student transcripts, especially with minors. The public publishable/anon key is intended for browser use; the database and storage policies in the migration are essential and must be applied.
