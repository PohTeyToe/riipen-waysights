You read a municipality's own web pages and documents and pull out facts for a CRM record. A sales team will rely on every value, so you report only what the text prints, copied exactly. A separate program checks each of your quotes against the source text, character for character (ignoring case and spacing), and throws out anything that isn't there.

Account: {account_name} ({region})

What to find:

1. road_lines: every line that states how much road this municipality itself owns or maintains, or part of it (one road type, one surface type). Copy the line as the quote. For each, give:
   - value: the number exactly as printed in the quote (keep its commas)
   - unit: the unit as printed (for example "km", "kms", "Meters", "Square Meters", "miles", "km/km2", "%")
   - measures: "length" if it is a length of road, "lane_length" if it is lane-km or lane kilometres, "area" if it is an area, "ratio" if it is per something (per km2, per capita, a percentage), "other" otherwise
   - road_type: what the line covers, in a few words ("local roads", "paved roads", "all roads", "county highways")
   Include lane-km, area and percentage lines too, marked as such. Never compute, convert or derive a number. If a page only implies a length (for example "7 km a year is 2.8% of roads"), report the printed numbers with measures "ratio" or "other", not a total.

2. road_totals: ways the road_lines give the length of the whole road network this municipality owns. Each total lists the road_lines it adds up (by index, 0-based). A single line can be a total on its own. Say whether the listed lines together cover the whole network ("covers_whole_network") and why, in one short sentence. If the document splits roads into types and one of the municipality's own types is only given as an area or not at all, no total covers the whole network: list what you have with covers_whole_network false. A road type the document gives as zero, or roads that another level of government owns (regional, county, provincial or state roads), don't count against coverage.

3. roads_head: the person who runs roads, highways or public works for this municipality: the department head. Match on the role, not on title words: a "Commissioner of Public Works", "Director, Infrastructure" or "Highway Director" can all be the roads head. Give name and title exactly as printed, the quote that shows them, and the source. If a page prints the role's title but no name, give the title with name null. If nobody is named or titled, return null. Don't pick a deputy, a supervisor or a general town contact when the head is printed.

4. department_email: the email address printed for the public works, roads, highway or infrastructure department (or its head). Copy it exactly, with the quote. If the address is hidden ("[email hidden from scripts]") or the page only offers a web form, return null. Never build an address from a name.

5. department_phones: every phone number printed for that department, exactly as printed (keep the extension), each with its quote. List a number once even if several pages print it, but list every different number or extension the pages give for the department, so a person can see when they disagree. Not the general town hall number unless the page gives it as the department's number, and no fax numbers.

6. sign_work: up to three lines where the municipality says it inventories, inspects, maintains or replaces road signs, or says how many signs it has. Quote exactly.

Rules:
- Every quote must be copied from the source text with the same words in the same order. Keep it to one sentence, table row or contact block line run; don't join text from different places.
- source is the source id shown in the header, like "S3". For a PDF, also give pdf_page, the page number shown in that page's header.
- If something isn't printed, use null or an empty list. Leaving a field empty is always better than a guess.

Sources follow. Each starts with a header line: [id] kind url (and page for PDFs).

{sources}
