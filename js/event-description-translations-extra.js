// Exact display translations of the existing public descriptions. Truncated source endings stay truncated.
(function(root) {
  const pairs = [
  [
    "The Brauerschwender Basaltlauf takes place on 27 June 2026 in Brauerschwend, offering runners of all ages a sporting challenge in attractive surroundings. The courses are gently undulating, well marked and have kilometre markers. Drinks are available on the course, and the organizer provides refreshments at the finish. The run is aimed at competitive runners as well as…",
    "Der Brauerschwender Basaltlauf findet am 27. Juni 2026 in Brauerschwend statt und bietet Läufern aller Altersklassen eine sportliche Herausforderung in einer schönen Umgebung. Die Strecken sind leicht profiliert, gut markiert und mit Kilometerangaben versehen. Auf der Strecke werden Getränke angeboten, und am Ziel sorgt der Veranstalter für das leibliche Wohl. Der Lauf richtet sich sowohl an Wettkampfläufer als auch"
  ],
  [
    "The BraunenBerg-Lauf on 19 September 2026 offers varied mountain-running routes in the Ostalb, appealing to beginners and experienced runners alike. The event includes several distances, including the technically straightforward 14.6 km VR Bank-BraunenBerg-Lauf with 446 m of ascent and the demanding 32 km Rolladen Kaiser-BraunenBerg-Trail with 1,100 m of ascent, which goes underground…",
    "Der BraunenBerg-Lauf am 19. September 2026 bietet abwechslungsreiche Berglaufstrecken auf der Ostalb, die sowohl Einsteigerinnen als auch erfahrene Läuferinnen ansprechen. Die Veranstaltung umfasst verschiedene Distanzen, darunter den technisch einfachen VR Bank-BraunenBerg-Lauf über 14,6 km mit 446 Höhenmetern sowie den anspruchsvollen Rolladen Kaiser-BraunenBerg-Trail mit 32 km und 1100 Höhenmetern, der unter Tage"
  ],
  [
    "The Braunschweiger Speed5 is Braunschweig's fastest community road race, organized by Polizeisportverein Braunschweig and Braunschweiger Laufclub. On 8 November 2026, an 800 m children's run, a one-mile school race and a measured 5 km race offer competition for recreational and ambitious runners of all ages. The event features professional…",
    "Der Braunschweiger Speed5 ist der schnellste Volkslauf der Stadt Braunschweig, veranstaltet vom Polizeisportverein Braunschweig und dem Braunschweiger Laufclub. Das Laufevent am 8. November 2026 bietet mit einem 800 m Kinderlauf, einem 1 Meile Schülerlauf und einem vermessenen 5 km Lauf für Freizeit- und ambitionierte Läufer aller Altersklassen spannende Wettkämpfe. Die Veranstaltung zeichnet sich durch professionell"
  ],
  [
    "The 39th Bredstedt-Cross takes place on 31 October 2026 at Sportpark Bredstedt, organized by Bredstedter TSV. The event offers cross-country races for a broad age range, from children and young people to adults and numerous masters categories. There are short and long cross-country races for men and women, with separate age groups from M6/W6 to M75/W75, including youth and U18/U20. The event…",
    "Der 39. Bredstedt-Cross findet am 31. Oktober 2026 im Sportpark Bredstedt statt und wird vom Bredstedter TSV ausgerichtet. Die Veranstaltung bietet Crossläufe für eine breite Altersspanne, von Kindern und Jugendlichen bis zu Aktiven und zahlreichen Mastersklassen. Es gibt kurze und lange Crossläufe für Männer und Frauen sowie separate Altersklassen von M6/W6 bis M75/W75, inklusive Jugend und U18/U20. Die Veranstaltun"
  ],
  [
    "The Bremer Firmenlauf zur Spätschicht is a shared running event over approximately 5 km around the Weserwehr in Bremen, emphasizing team spirit and togetherness. It is aimed at companies, groups of friends and running groups who want to run or walk together without competitive pressure. New for 2026, official timing is available for the first time for everyone who wants to track their sporting…",
    "Der Bremer Firmenlauf zur Spätschicht ist ein gemeinschaftliches Laufevent über circa 5 km rund ums Weserwehr in Bremen, das den Teamgeist und das Miteinander in den Vordergrund stellt. Die Veranstaltung richtet sich an Unternehmen, Freundeskreise und Laufgemeinschaften, die gemeinsam ohne Leistungsdruck laufen oder walken möchten. Neu 2026 gibt es erstmals eine offizielle Zeitmessung für alle, die ihren sportlichen"
  ],
  [
    "The Buchholzer Stadtlauf is a long-established race with a devoted following in the Nordheide, taking place on 21 June 2026. The course runs through central Buchholz, supported by numerous spectators who create a special atmosphere and provide motivation. Various distances offer suitable challenges for all ages and abilities, from children's races to the popular…",
    "Der Buchholzer Stadtlauf ist ein traditionsreicher Lauf mit Kultcharakter in der Nordheide, der am 21. Juni 2026 stattfindet. Die Strecke führt mitten durch die Innenstadt von Buchholz und wird von zahlreichen Zuschauern begleitet, was für eine besondere Atmosphäre und Motivation sorgt. Verschiedene Distanzen bieten für alle Alters- und Leistungsgruppen passende Herausforderungen, vom Kinderlauf bis zum beliebten Sta"
  ],
  [
    "The Eppsteiner Burg-Lauf is a traditional Taunus running classic held annually since 1986, attracting up to 500 runners and numerous spectators. The varied 7.777 km course passes through woodland and the historic old town, circling the medieval castle twice before climbing the Schmerzberg to the finish at the TSG Eppstein sports ground. The event also offers…",
    "Der Eppsteiner Burg-Lauf ist ein traditionsreicher Laufklassiker im Taunus, der seit 1986 jährlich stattfindet und bis zu 500 Läuferinnen und Läufer sowie zahlreiche Zuschauer anzieht. Die abwechslungsreiche Strecke von 7,777 km führt durch Wald, die historische Altstadt und zweimal um die mittelalterliche Burg, bevor es den Schmerzberg hinauf zum Ziel am Sportplatz der TSG Eppstein geht. Die Veranstaltung bietet neb"
  ],
  [
    "The Burgentrail in Ostheim is a demanding trail-running event hosting the Lower Franconian Trail Running Championships on 3 October 2026. The route follows varied woodland and meadow paths past historic castle ruins including Lichtenburg and Königsburg, with technically challenging trails, roots and steep descents. The scenery and views…",
    "Der Burgentrail in Ostheim ist eine anspruchsvolle Traillaufveranstaltung, die am 3. Oktober 2026 die Unterfränkischen Traillaufmeisterschaften austrägt. Die Strecke führt durch abwechslungsreiche Wald- und Wiesenwege, vorbei an historischen Burgruinen wie der Lichtenburg und der Königsburg, und bietet dabei technisch anspruchsvolle Trails mit Wurzeln und steilen Abstiegen. Die landschaftliche Kulisse mit Ausblicken"
  ],
  [
    "The Burscheider Stadtlauf takes place on 11 October 2026 in central Burscheid, offering a suitable setting for runners of all abilities. Distances include the main 10 km race, a 3 km run and an 800 m run that qualifies toward the German Sports Badge. The event has a friendly, family atmosphere and is aimed at both…",
    "Der Burscheider Stadtlauf findet am 11. Oktober 2026 in der Stadtmitte von Burscheid statt und bietet Läuferinnen und Läufern aller Leistungsniveaus ein optimales Umfeld. Es gibt verschiedene Distanzen: den 10-Kilometer-Hauptlauf, einen 3-Kilometer-Lauf sowie einen 800-Meter-Lauf, der als Qualifikation für das Sportabzeichen dient. Die Veranstaltung ist geprägt von einer familiären Atmosphäre und richtet sich sowohl"
  ],
  [
    "The BWM Sommerlochlauf takes place on 4 August 2026 in Steinheim an der Murr. This 10 km race is particularly suitable for runners who enjoy speed. The flat, fast course through Steinheim offers ideal conditions for personal bests. Its friendly organization and lively atmosphere make it a popular weekday event where sports enthusiasts can share their…",
    "Der BWM Sommerlochlauf findet am 4. August 2026 in Steinheim an der Murr statt und ist ein 10 km Lauf, der besonders für alle Tempoliebhaber geeignet ist. Die flache und schnelle Strecke durch Steinheim bietet ideale Bedingungen, um persönliche Bestzeiten zu erzielen. Die familiäre Organisation und die lebendige Atmosphäre machen den Lauf zu einem beliebten Event unter der Woche, bei dem Sportbegeisterte gemeinsam ih"
  ],
  [
    "The Canyon Run takes place on 6 September 2026 at the Dietesheim sports facility in Mühlheim am Main. Distances include a 400 m mini run, an 800 m school race, 5 km, 10 km and a half marathon. Online registration remains open until 4 pm on 5 September; late entries are planned for race day.",
    "Der Canyon Run findet am 6. September 2026 an der Sportanlage Dietesheim in Mühlheim am Main statt. Zur Auswahl stehen 400 m Mini-Lauf, 800 m Schülerlauf, 5 km, 10 km und Halbmarathon. Die Online-Anmeldung bleibt bis zum 5. September um 16 Uhr geöffnet; Nachmeldungen sind am Veranstaltungstag vorgesehen."
  ],
  [
    "The Charity Mega Run in Bingen am Rhein is a distinctive running event with a mission: getting people moving for themselves, for others and for a good cause. Four course lengths from 5 km to 52 km follow what is described as Germany's most beautiful running route, with Rhine panoramas and vineyards. The event also includes a pasta party the evening before and a varied supporting programme…",
    "Der Charity Mega Run in Bingen am Rhein ist ein einzigartiges Laufevent mit einer Mission: Menschen in Bewegung zu bringen - für sich selbst, für andere und für den guten Zweck. Die Veranstaltung bietet vier Streckenlängen von 5 km bis 52 km entlang der schönsten Laufstrecke Deutschlands mit herrlichem Rheinpanorama und Weinbergen. Neben dem Lauf gibt es eine Pasta Party am Vorabend und ein vielfältiges Rahmenprogram"
  ],
  [
    "The Christmas Run To Tree is an atmospheric woodland run in the Klövensteen forest near Hamburg, taking place on 29 November 2026. Participants can choose between 6 km and 12 km. The race combines physical activity with the special experience of buying a Christmas tree. It offers a friendly family atmosphere and is suitable for runners of all ages.",
    "Der Christmas Run To Tree ist ein stimmungsvoller Waldlauf im Forst Klövensteen bei Hamburg, der am 29. November 2026 stattfindet. Die Teilnehmer können zwischen zwei Streckenlängen wählen: 6 km oder 12 km. Der Lauf verbindet sportliche Aktivität mit dem besonderen Erlebnis, einen Weihnachtsbaum zu kaufen. Die Veranstaltung bietet eine familiäre Atmosphäre und ist ideal für Läufer aller Altersgruppen."
  ],
  [
    "The 22nd GLOMB City Marathon Bremerhaven takes place on 6 September 2026, starting and finishing in the Havenwelten. The programme includes 400 m and 800 m children's races, 5 km, corporate runs over 6 km and 10 km, the 10 km race, half marathon, three-quarter marathon, marathon and marathon relays.",
    "Der 22. GLOMB City Marathon Bremerhaven findet am 6. September 2026 mit Start und Ziel in den Havenwelten statt. Das Programm umfasst Kinderläufe über 400 m und 800 m, 5 km, Firmenläufe über 6 km und 10 km, den 10-km-Lauf, Halbmarathon, Dreiviertelmarathon, Marathon und Marathonstaffeln."
  ],
  [
    "The Citylauf Grevenbroich is a family-friendly running event with nine different races for sports enthusiasts of all ages. It offers suitable courses, entertainment and well-organized races supported by the whole town. Alongside the competition, there is an attractive supporting programme and sought-after prizes for the top participants. The races range from short…",
    "Der Citylauf Grevenbroich ist ein familienfreundliches Laufevent mit neun verschiedenen Läufen, das Sportbegeisterte jeden Alters anspricht. Die Veranstaltung bietet ideale Strecken, beste Unterhaltung und eine top Organisation, die von der ganzen Stadt unterstützt wird. Neben dem sportlichen Wettbewerb gibt es ein attraktives Rahmenprogramm und begehrte Preise für die besten Teilnehmer. Die Läufe reichen von kurzen"
  ],
  [
    "The Darmstädter Merck Stadtlauf is a long-established city race celebrating its 47th edition in 2026. The route passes through central Darmstadt and has been adjusted due to construction work to include historic locations such as Marktplatz and Kirchstraße. The race attracts numerous participants each year and offers a lively atmosphere with live music and an enthusiastic team of presenters.",
    "Der Darmstädter Merck Stadtlauf ist ein traditionsreicher Stadtlauf, der 2026 seine 47. Auflage feiert. Die Strecke führt durch die Innenstadt von Darmstadt und wurde aufgrund von Baumaßnahmen angepasst, um historische Plätze wie den Marktplatz und die Kirchstraße einzubeziehen. Der Lauf zieht jährlich zahlreiche Teilnehmer an und bietet eine lebendige Atmosphäre mit Live-Musik und einem engagierten Moderatorenteam."
  ],
  [
    "DeisterCrossing is an outdoor endurance event combining running and hiking in the woodland scenery of the Deister hills. It offers 10 km, 21.1 km and 42.2 km routes for runners and walkers. The demanding routes include the Deisterhölle, with 200 m of uninterrupted ascent, offering a distinctive nature and hill experience near Hanover. The…",
    "Das DeisterCrossing ist ein naturnahes Ausdauer-Event, das Laufen und Marschieren in der herausragenden Natur des waldigen Deistergebirgszugs verbindet. Die Veranstaltung bietet Strecken über 10 km, 21,1 km und 42,2 km für Läufer und Marschierer. Die anspruchsvollen Strecken führen unter anderem durch die Deisterhölle mit 200 Höhenmetern am Stück und bieten ein einzigartiges Natur- und Bergerlebnis nahe Hannover. Die"
  ],
  [
    "The Alstertallauf is a friendly race on the upper Alster walking trail, regarded as Hamburg's most beautiful running route. It welcomes running enthusiasts of all ages and recreational athletes, offering several distances. The event takes place near Albert-Schweitzer-Gymnasium in Hamburg and is known for its welcoming atmosphere. In 2022, more than 200 runners…",
    "Der Alstertallauf ist ein familiärer Lauf auf dem oberen Alsterwanderweg, der als die schönste Laufstrecke Hamburgs gilt. Er richtet sich an große und kleine Laufbegeisterte sowie Freizeitsportler und bietet verschiedene Distanzen an. Die Veranstaltung findet in der Nähe des Albert-Schweitzer-Gymnasiums in Hamburg statt und ist bekannt für ihre freundliche Atmosphäre. Im Jahr 2022 nahmen über 200 Läuferinnen und Läuf"
  ],
  [
    "Die 10 km von Dürwiß is a long-established road race held on the first Saturday in August each year by SV Germania Dürwiß e.V. More than 500 runners from Germany and abroad take part, with winning times usually around 30 minutes. The flat, officially measured 2 km asphalt circuit runs through central Dürwiß and is fully closed to traffic on race day.",
    "Die 10 km von Dürwiß ist ein traditionsreicher Straßenlauf, der jährlich am ersten Samstag im August vom SV Germania Dürwiß e.V. veranstaltet wird. Über 500 Läuferinnen und Läufer aus dem In- und Ausland nehmen teil, wobei die Siegerzeiten meist bei etwa 30 Minuten liegen. Die flache, amtlich vermessene 2 km Asphalt-Rundstrecke führt durch den Ortskern von Dürwiß und ist am Lauftag komplett für den Verkehr gesperrt."
  ],
  [
    "Die Nacht von Borgholzhausen is a special running event taking place on 20 June 2026 in central Borgholzhausen. From the youngest children's race and school running to the atmospheric 10 km night race, there is something for all ages and abilities. Its distinctive atmosphere features live music, cheerleaders, DJs and torches along the course…",
    "Die Nacht von Borgholzhausen ist ein besonderes Laufevent, das am 20. Juni 2026 in der Innenstadt von Borgholzhausen stattfindet. Von Bambinilauf über Schoolrunning bis hin zum stimmungsvollen 10 km-Nachtlauf ist für alle Altersgruppen und Leistungsniveaus etwas dabei. Die Veranstaltung zeichnet sich durch eine einzigartige Atmosphäre aus, die von Live-Musik, Cheerleadern, DJs und Fackeln entlang der Strecke geprägt"
  ],
  [
    "The Dieburger Stadtlauf takes place annually in central Dieburg, with races for age groups ranging from young children to the main 10 km race. The route leads from Marktplatz through the old town and is accessible to all participants. Alongside individual racing, team and school competitions are a focus, making it a popular event for families and the local community…",
    "Der Dieburger Stadtlauf findet jährlich in der Dieburger Innenstadt statt und bietet Läufe für verschiedene Altersklassen von Bambinis bis zum Hauptlauf über 10 km. Die Strecke führt vom Marktplatz durch die Altstadt und ist für alle Teilnehmer gut zugänglich. Neben dem sportlichen Wettkampf steht auch der Team- und Schulwettbewerb im Fokus, was den Lauf zu einem beliebten Event für die ganze Familie und lokale Gemei"
  ],
  [
    "The Keltenlauf in Ditzingen-Hirschlanden is a varied race for young and old, with distances of 12 km, 6 km, 1.5 km and 800 m. The route passes through the scenic Strohgäu region and significant archaeological sites including the Celtic warrior and the Celtic woman's grave. The races take place at the Seehansen sports and leisure centre, offering both adults and schoolchildren…",
    "Der Keltenlauf in Ditzingen-Hirschlanden ist ein vielseitiger Lauf für Jung und Alt mit Distanzen von 12 km, 6 km, 1,5 km und 800 m. Die Strecke führt durch die landschaftlich reizvolle Region Strohgäu und passiert bedeutende archäologische Denkmäler wie den Keltenkrieger und das keltische Frauengrab. Die Läufe finden am Sport- und Freizeitzentrum Seehansen statt und bieten sowohl für Erwachsene als auch für Schüler"
  ],
  [
    "The dm Firmenlauf Saarbrücken is a sporting event for teams and companies, taking place on 2 June 2026 in central Saarbrücken. Its flat, asphalt 5 km course starts at the state theatre, follows the Saar and passes through the city centre, with an enthusiastic atmosphere and cheering spectators. Afterwards, participants can enjoy an after-run party with live music, an awards ceremony and refreshments…",
    "Der dm Firmenlauf Saarbrücken ist ein sportliches Event für Teams und Firmen, das am 2. Juni 2026 in der Saarbrücker Innenstadt stattfindet. Die 5 km lange, flache und asphaltierte Strecke führt vom Staatstheater entlang der Saar und durch die Innenstadt, begleitet von einer großartigen Stimmung und Zuschauerjubel. Nach dem Lauf erwartet die Teilnehmer eine After-Run-Party mit Live-Musik, Siegerehrung und Verpflegung"
  ],
  [
    "The Drachenlauf is a demanding trail race in the Siebengebirge near Königswinter, taking place on 25 October 2026. The route passes through one of Germany's oldest nature parks, offering technically challenging trails with more than 1,000 m of ascent, steep climbs and long descents. It is aimed at experienced runners who want to experience nature and test their limits. The event is…",
    "Der Drachenlauf ist ein anspruchsvoller Traillauf im Siebengebirge bei Königswinter, der am 25. Oktober 2026 stattfindet. Die Strecke führt durch einen der ältesten Naturparks Deutschlands und bietet technisch herausfordernde Trails mit über tausend Höhenmetern, steilen Anstiegen und langen Bergabpassagen. Der Lauf richtet sich an erfahrene Läufer, die die Natur und ihre Grenzen erleben möchten. Die Veranstaltung ist"
  ],
  [
    "The first DresdenHALF starts at 9 am on 6 September 2026. The 21.1 km course runs through the heart of Dresden, past the historic old town, the Großer Garten and the banks of the Elbe. The organizer advertises registration opportunities until 31 August.",
    "Der erste DresdenHALF startet am 6. September 2026 um 9 Uhr. Die 21,1-km-Strecke führt durch das Herz Dresdens, entlang der historischen Altstadt, des Großen Gartens und des Elbufers. Der Veranstalter weist auf Anmeldemöglichkeiten bis zum 31. August hin."
  ],
  [
    "The Dünenlauf Sandhausen takes place on 13 June 2026 at Walter-Reinhard-Stadion, with flat, varied routes through woodland and over a sand dune. There are races for young children, plus timed 5 km and 10 km races. This is a DLV-approved community race held in all weather conditions. Refreshments are provided, and the course is closed to road traffic.",
    "Der Dünenlauf Sandhausen findet am 13. Juni 2026 im Walter-Reinhard-Stadion statt und bietet flache, abwechslungsreiche Strecken durch Wald und über eine Sanddüne. Es gibt Läufe für Bambini, 5 km und 10 km mit Zeitmessung. Die Veranstaltung ist ein DLV genehmigter Volkslauf und findet bei jeder Witterung statt. Für Verpflegung ist gesorgt, und die Strecke ist für den Straßenverkehr abgesperrt."
  ],
  [
    "The Durlacher Turmberglauf is a flat, fast 10 km race through the historic old town of Durlach, along the Pfinz to just before Grötzingen and back. It has become a regular fixture for the region's runners, offering an appealing course for ambitious athletes. There is also a children's race in the Durlach palace gardens. The event combines sporting…",
    "Der Durlacher Turmberglauf ist ein flacher und schneller 10-Kilometer-Lauf durch die historische Durlacher Altstadt, entlang der Pfinz bis kurz vor Grötzingen und zurück. Der Lauf hat sich als fester Termin für Laufsportbegeisterte aus der Region etabliert und bietet eine attraktive Strecke für ambitionierte Läufer. Zusätzlich findet ein Kinderlauf im Durlacher Schlossgarten statt. Die Veranstaltung verbindet sportli"
  ],
  [
    "The 15th Edersee-Lauf, scheduled for 29 August 2026, was cancelled by SV 1921 Herzhausen because of construction of the new barbecue hut.",
    "Der für den 29. August 2026 geplante 15. Edersee-Lauf wurde vom SV 1921 Herzhausen wegen des Neubaus der Grillhütte abgesagt."
  ],
  [
    "The Duracher Lauf on 21 June 2026 offers suitable courses for runners of all ages and abilities: 5.5 km, 10 km, a kids' run and a school race. The event emphasizes professional organization, safety and a memorable atmosphere. Alongside the competition, there is a large joint awards ceremony, prize money for new course records and a raffle. Team…",
    "Der Duracher Lauf am 21. Juni 2026 bietet Läuferinnen und Läufern aller Altersklassen und Leistungsniveaus passende Strecken mit 5,5 km, 10 km, Kids Run und Schülerlauf. Die Veranstaltung legt Wert auf eine professionelle Organisation, Sicherheit und eine unvergessliche Atmosphäre. Neben dem sportlichen Wettkampf gibt es eine große gemeinsame Siegerehrung, Preisgelder für neue Streckenrekorde und eine Verlosung. Team"
  ],
  [
    "The EDITH LÜCKE-Frauenlauf in Trier is a special race holding its sixth edition on 20 September 2026. Its 5 km course offers a sightseeing tour through Trier's Roman history, starting in front of the Imperial Baths and finishing in the amphitheatre. It is aimed at women and girls aged twelve and over, focusing on the enjoyment of shared physical activity…",
    "Der EDITH LÜCKE-Frauenlauf in Trier ist ein besonderer Lauf, der am 20. September 2026 seine sechste Auflage erlebt. Die 5 Kilometer lange Strecke führt als Sightseeing-Tour durch die römische Geschichte Triers mit Start vor den Kaiserthermen und einem krönenden Zieleinlauf im Amphitheater. Der Lauf richtet sich an Frauen und Mädchen ab zwölf Jahren und legt den Fokus auf die Freude an der Bewegung in Gemeinschaft, u"
  ],
  [
    "The sixth Ehriker Stadtmauerlauf takes place on 30 August 2026 in Ehrang, with a varied programme over several distances. New to the programme is the 10 km Burg-Ramstein-Lauf, a shaded scenic race that forms part of the 4REGIO-CUP. The 5 km route follows four laps through the old village, creating a lively city-race atmosphere. For children there are youth races and races for the youngest…",
    "Der 6. Ehriker Stadtmauerlauf findet am 30. August 2026 in Ehrang statt und bietet Läufern ein abwechslungsreiches Programm mit verschiedenen Distanzen. Neu im Programm ist der 10km-Burg-Ramstein-Lauf, ein schattiger Landschaftslauf, der Teil des 4REGIO-CUP ist. Die 5km-Strecke führt durch das alte Dorf mit einer stimmungsvollen Stadtlaufatmosphäre auf vier Runden. Für Kinder gibt es spannende Jugendläufe und Bambini"
  ],
  [
    "The Eltviller Familienlauf on 20 September 2026 offers routes for all ages, from young children's races to 10 km. The course mainly follows paved streets with flat cobblestones and a short, gently rising section. This family-friendly event accepts individual and team entries. Race packs can be collected the day before or on race…",
    "Der Eltviller Familienlauf am 20. September 2026 bietet verschiedene Laufstrecken für alle Altersgruppen, von Bambini bis zum 10-km-Lauf. Die Strecke führt überwiegend über gepflasterte Straßen mit flachem Kopfsteinpflaster und einem kurzen, leicht ansteigenden Abschnitt. Die Veranstaltung ist familienfreundlich und ermöglicht sowohl Einzel- als auch Team-Anmeldungen. Die Startunterlagen können am Vortag oder am Wett"
  ],
  [
    "The Ensinger Laufcup on 17 October 2026 offers distances for all ages and abilities in the scenic Vaihingen an der Enz region. Races range from young children's runs to demanding trails of up to 24 km with up to 700 m of ascent. Runners can enjoy varied scenery with asphalt and gravel paths…",
    "Der Ensinger Laufcup am 17. Oktober 2026 bietet Läuferinnen und Läufern aller Altersklassen und Leistungsniveaus passende Distanzen in der schönen Region Vaihingen an der Enz. Die Veranstaltung umfasst verschiedene Läufe von Bambini bis hin zu anspruchsvollen Trailstrecken mit bis zu 24 Kilometern und bis zu 700 Höhenmetern. Die Läuferinnen und Läufer können die abwechslungsreiche Landschaft mit Asphalt, Schotterwege"
  ],
  [
    "The Erftflitzerlauf in Neuss-Holzheim is a family-friendly running event with a long tradition dating back to 1993. It offers races for children, teenagers and adults, from short runs for young children to 5.5 km for adults and teenagers. The event emphasizes fun, community spirit and the enjoyment of running.",
    "Der Erftflitzerlauf in Neuss-Holzheim ist eine familienfreundliche Laufveranstaltung mit einer langen Tradition seit 1993. Die Veranstaltung bietet verschiedene Wettbewerbe für Kinder, Jugendliche und Erwachsene, von kurzen Bambini-Läufen bis zu 5,5 km für Erwachsene und Jugendliche. Der Lauf zeichnet sich durch seinen Spaßcharakter aus, bei dem der Gemeinschaftsgedanke und die Freude am Laufen im Vordergrund stehen."
  ],
  [
    "The third Eschweiler Citylauf takes place on 23 August 2026, organized by Marathon-Club Eschweiler, which is hosting a community race in Eschweiler for the 40th time. The start and finish are in the city centre on Marienstraße and Grabenstraße. There are school races and two adult distances: 5 km and 10 km, with the 10 km also serving as an LVN-N…",
    "Der Eschweiler Citylauf findet am 23. August 2026 zum dritten Mal statt und wird vom Marathon-Club Eschweiler organisiert, der bereits zum 40. Mal einen Volkslauf in Eschweiler ausrichtet. Start und Ziel befinden sich in der Eschweiler Innenstadt auf der Marienstraße und Grabenstraße. Angeboten werden Schülerläufe sowie zwei Distanzen für Erwachsene: 5 Kilometer und 10 Kilometer, wobei die 10 Kilometer auch als LVN-N"
  ],
  [
    "The 31st Esenser Stadtlauf, held as the sixth Esenser Volksbanklauf, takes place on Friday, 31 July 2026 in Esens. The long-established Rund um St. Magnus race offers city-centre competition for runners of all ages. It begins with a 670 m race for young children, followed by 1,340 m school races. Adults can compete over 5 km and 10 km, which…",
    "Der 31. Esenser Stadtlauf, ausgetragen als 6. Esenser Volksbanklauf, findet am Freitag, den 31. Juli 2026, in Esens statt. Der traditionsreiche Lauf Rund um St. Magnus bietet Läufern aller Altersklassen spannende Wettkämpfe in der Innenstadt. Die Veranstaltung beginnt mit dem Bambini-Lauf über 670 Meter, gefolgt von Schülerläufen über 1340 Meter. Für Erwachsene gibt es Wettbewerbe über fünf und zehn Kilometer, die"
  ],
  [
    "The Fehmarn-Marathon takes place on 5 September 2026 at the sports ground by the Inselschule on Fehmarn. Distances include 1.4 km, 5 km, 12 km, a half marathon and a marathon; online and on-site late entries are planned.",
    "Der Fehmarn-Marathon findet am 5. September 2026 am Sportplatz an der Inselschule in Fehmarn statt. Angeboten werden 1,4 km, 5 km, 12 km, Halbmarathon und Marathon; Online- und Vor-Ort-Nachmeldungen sind vorgesehen."
  ],
  [
    "The first AOK Firmenlauf Renningen takes place on 24 June 2026 in Renningen, offering a team event for colleagues. Its approximately 4.6 km course consists of two 2.3 km laps. The race is part of the BW-Running corporate-run series, emphasizing inclusion, shared experiences and celebration. Afterwards there are free finish-line refreshments and an awards ceremony with music…",
    "Der 1. AOK Firmenlauf Renningen findet am 24. Juni 2026 in Renningen statt und bietet ein großartiges Team-Event für Kolleg:innen. Die Strecke umfasst ca. 4,6 km, die aus zwei Runden von jeweils 2,3 km bestehen. Der Lauf ist Teil der BW-Running-Firmenlaufserie und legt Wert auf Inklusion sowie gemeinsames Erleben und Feiern. Nach dem Lauf gibt es eine kostenfreie Zielverpflegung und eine Siegerehrung mit musikalische"
  ],
  [
    "The Fischerhuder Sommerlauf, organized by Sportfreunde Fischerhude e.V., takes place on 27 June 2026 from 6 pm. It offers a 1 km children's race and 5 km and 10 km races for teenagers and adults on an officially measured 5 km circuit. There is also a 2 × 5 km relay for friends, families and colleagues. The event offers a friendly family atmosphere…",
    "Der Fischerhuder Sommerlauf, organisiert von den Sportfreunden Fischerhude e.V., findet am 27. Juni 2026 ab 18:00 Uhr statt. Angeboten werden Strecken über 1 km für Kinder sowie 5 km und 10 km für Jugendliche und Erwachsene, die auf einem offiziell vermessenen 5 km-Rundkurs gelaufen werden. Zusätzlich gibt es eine Staffel über 2x5 km für Freunde, Familien und Kollegen. Die Veranstaltung bietet eine familiäre Atmosphä"
  ],
  [
    "The eighth Flensburg liebt dich Marathon takes place on 6 September 2026. The programme includes a 195 m run for young children, a 1.07 km children's race, 5 km, 10 km, a half marathon, a marathon and a marathon relay. Registration is exclusively online until midnight on 30 August.",
    "Der 8. Flensburg liebt dich Marathon findet am 6. September 2026 statt. Angeboten werden Bambinilauf über 195 m, Kinderlauf über 1,07 km, 5 km, 10 km, Halbmarathon, Marathon und Marathonstaffel. Die Anmeldung ist ausschließlich online bis zum 30. August um 24 Uhr möglich."
  ],
  [
    "The 15th Flörsheimer Lebenslauf on 29 August 2026 is a traditional race commemorating deliverance from the plague in 1666. The approximately 10 km route follows two laps from the Main riverbank via Eddersheim, the town gardens and the old town to the historic Gallusplatz finish. The motto 'Remember – Run – Give Thanks' reflects the event's religious and community character. The…",
    "Der 15. Flörsheimer Lebenslauf am 29. August 2026 ist ein traditionsreicher Lauf, der an die Rettung von der Pest im Jahr 1666 erinnert. Die ca. 10 km lange Strecke führt in zwei Runden vom Mainufer über Eddersheim, den Stadtgarten und die Altstadt bis zum historischen Gallusplatz, dem Ziel. Das Motto \"Erinnern - Laufen - Danken\" spiegelt den religiösen und gemeinschaftlichen Charakter der Veranstaltung wider. Der Er"
  ],
  [
    "The anniversary edition of the Fränkische Schweiz-Marathon takes place on 5 and 6 September 2026. Saturday offers children's races and the one-tenth marathon; Sunday follows with 10 km, a half marathon, a marathon, a marathon relay, Run & Bike and a handbike marathon. Online registration closes on 30 August.",
    "Die Jubiläumsausgabe des Fränkische Schweiz-Marathons findet am 5. und 6. September 2026 statt. Samstags werden Kinderläufe und der 1/10-Marathon angeboten; sonntags folgen 10 km, Halbmarathon, Marathon, Marathonstaffel, Run & Bike und Handbike-Marathon. Die Online-Anmeldung schließt am 30. August."
  ],
  [
    "The Freiberger Bürgerfestlauf is one of Germany's largest civic-festival running events, taking place on 17 July 2026 in Freiberg. More than 1,600 runners participate on four courses from 600 m to 10 km. It has a finisher rate above 95% and is followed by a community festival with live music on Marktplatz. The start and…",
    "Der Freiberger Bürgerfestlauf ist eines der größten Bürgerfestlauf-Events Deutschlands und findet am 17. Juli 2026 in Freiberg statt. Über 1.600 Läuferinnen und Läufer nehmen an vier verschiedenen Strecken von 600 Metern bis 10 Kilometern teil. Das Event zeichnet sich durch eine hohe Finisherquote von über 95 % aus und wird von einem anschließenden Bürgerfest mit Live-Musik auf dem Marktplatz begleitet. Der Start und"
  ],
  [
    "The Freisinger Sparkassen-Lauf is a popular summer race in the Isar floodplains around the SC Freising stadium. It offers courses for children and teenagers, plus main races over 5.5 km and 10 km, predominantly on gravel and woodland paths along the Isar. The event welcomes all kinds of athletes, with a friendly atmosphere and individual and team classifications. Refreshments…",
    "Der Freisinger Sparkassen-Lauf ist ein beliebter Sommerlauf in den Isarauen rund um das Stadion des SC Freising. Er bietet Strecken für Kinder, Jugendliche sowie Hauptläufe über 5,5 km und 10 km, die überwiegend auf Schotter- und Waldwegen entlang der Isar verlaufen. Die Veranstaltung richtet sich an alle Sporttypen und zeichnet sich durch eine familiäre Atmosphäre mit Einzel- und Mannschaftswertungen aus. Für das le"
  ],
  [
    "The Freystädter Volksfestlauf is a traditional running event in Freystadt, Bavaria, held annually during the town's festival. The races start and finish at the town hall on Marktplatz, offering various distances for adults, schoolchildren and the youngest runners. The event has a friendly family atmosphere, with awards for the best runners and teams and special classifications…",
    "Der Freystädter Volksfestlauf ist eine traditionelle Laufveranstaltung in Freystadt, Bayern, die jährlich im Rahmen des Freystädter Volksfestes stattfindet. Die Läufe starten und enden am Rathaus am Marktplatz und bieten verschiedene Distanzen für Erwachsene, Schüler und Bambini. Die Veranstaltung zeichnet sich durch eine familiäre Atmosphäre aus, mit Ehrungen für die besten Läufer und Mannschaften sowie Sonderwertun"
  ],
  [
    "The Friedrichshaller Runde is a long-established running event in Bad Friedrichshall, taking place on 26 September 2026. Part of the 3-Flüsse-Cup, it offers an attractive route through the region's scenery. It welcomes runners of all abilities, combining a sporting challenge with scenic highlights. The organization is…",
    "Die Friedrichshaller Runde ist eine traditionsreiche Laufveranstaltung in Bad Friedrichshall, die am 26. September 2026 stattfindet. Sie ist Teil des 3-Flüsse-Cups und bietet Läufern eine attraktive Strecke durch die reizvolle Landschaft der Region. Die Veranstaltung richtet sich an Laufbegeisterte aller Leistungsstufen und verbindet sportliche Herausforderung mit landschaftlichen Highlights. Die Organisation erfolgt"
  ],
  [
    "The Friedrichstaler Waldlauf is part of the Stutensee-Cup and holds its 11th edition in 2026. The series consists of four scored 10 km races, with runners automatically included in the standings after completing at least three. The course offers an attractive autumn run in Friedrichstal for runners of all abilities. After the final race…",
    "Der Friedrichstaler Waldlauf ist Teil des Stutensee-Cups und findet 2026 zum 11. Mal statt. Die Veranstaltung umfasst vier Wertungsläufe über 10 km, bei denen Läufer:innen automatisch in die Wertung kommen, wenn sie an mindestens drei Läufen teilnehmen. Die Strecke bietet eine attraktive Laufmöglichkeit im herbstlichen Friedrichstal und richtet sich an Läufer:innen aller Leistungsstufen. Im Anschluss an den letzten L"
  ],
  [
    "The Friesencross in Schillig is one of Germany's most unusual cross-country events, taking place on 25 July 2026. Its course runs directly along the beach, offering a distinctive outdoor experience beside the UNESCO World Heritage Wadden Sea. Runners cross soft sand, green meadows and even the muddy seabed, combining a sporting challenge with the North Sea atmosphere…",
    "Der Friesencross in Schillig ist eines der außergewöhnlichsten Crosslauf-Events Deutschlands und findet am 25. Juli 2026 statt. Die Strecke führt direkt am Strand entlang und bietet ein einzigartiges Naturerlebnis entlang des UNESCO-Weltnaturerbes Wattenmeer. Die Läufer:innen durchqueren weichen Sandstrand, grüne Wiesen und sogar den schlickigen Meeresboden, was sportliche Herausforderung und Nordseefeeling perfekt v"
  ],
  [
    "The FSV-Lauf takes place on 25 October 2026 in the Brucker Lache in Erlangen, with races for all ages from young children to adults. The course is a relatively flat 5 km circuit, run twice for the 10 km race. Alongside sport, the event supports a social cause: €2 per participant is donated to Förderverein Erlanger Tafel. For…",
    "Der FSV-Lauf findet am 25. Oktober 2026 in der Brucker Lache in Erlangen statt und bietet Läufen für alle Altersgruppen von Bambinis bis zu Erwachsenen. Die Strecke ist ein relativ flacher Rundkurs von 5 km, der für den 10 km Lauf zweimal durchlaufen wird. Neben dem sportlichen Erlebnis steht auch das soziale Engagement im Vordergrund, da pro Teilnehmer 2 Euro an den Förderverein Erlanger Tafel gespendet werden. Für"
  ],
  [
    "The Fuchsburg Lauf is organized by TV Vohburg as part of the Vohburger Fuchsburgfest on 27 June 2026. Runners of different ages and abilities can enjoy attractive routes through the region. Races include a main 10 km course, a 2.3 km school race and a 600 m run for young children. The event is…",
    "Der Fuchsburg Lauf wird vom TV Vohburg ausgerichtet und findet im Rahmen des Vohburger Fuchsburgfestes am 27. Juni 2026 statt. Die Veranstaltung bietet Läuferinnen und Läufern verschiedener Altersklassen und Leistungsniveaus die Möglichkeit, auf attraktiven Strecken durch die Region zu laufen. Die Läufe umfassen eine 10-km-Hauptstrecke, einen 2,3-km-Schülerlauf sowie einen 600-m-Bambini-Lauf. Die Veranstaltung ist ge"
  ],
  [
    "The Fürstenwaldlauf is a traditional scenic race in Upper Swabia, holding its 45th edition in 2026. It takes place on 19 June as part of Ochsenhausen's Öchslefest and has a friendly family atmosphere. The main race is a quarter marathon, predominantly on woodland paths with some demanding sections, ending with a stadium lap at the Ho… sports ground…",
    "Der Fürstenwaldlauf ist ein traditionsreicher Landschaftslauf in Oberschwaben, der 2026 bereits zum 45. Mal stattfindet. Er wird im Rahmen des Öchslefestes der Stadt Ochsenhausen am 19. Juni veranstaltet und zeichnet sich durch eine familiäre Atmosphäre aus. Der Hauptlauf ist ein Viertelmarathon, der überwiegend auf Waldwegen mit teils anspruchsvollen Abschnitten verläuft und mit einer Stadionrunde im Sportgelände Ho"
  ],
  [
    "The 40th Gänseliesellauf takes place on 12 June 2026 in Monheim am Rhein, traditionally opening the town festival. Five races cater to different age groups, from 900 m for kindergarten children to 10 km for adults. It is organized by the town of Monheim am Rhein together with Sportgemeinschaft Monheim 1894/1968 e.V., offering…",
    "Der 40. Gänseliesellauf findet am 12. Juni 2026 in Monheim am Rhein statt und eröffnet traditionell das Stadtfest. Es werden fünf verschiedene Läufe für unterschiedliche Altersgruppen angeboten, von einem 900-Meter-Lauf für Kindergartenkinder bis hin zu 10 Kilometer für Erwachsene. Die Veranstaltung wird von der Stadt Monheim am Rhein gemeinsam mit der Sportgemeinschaft Monheim 1894/1968 e. V. organisiert und bietet"
  ],
  [
    "The Gäulauf in the Edenkoben municipality is a traditional community race that has brought runners together in Gommersheim for more than two decades. On 3 June 2026 it offers various distances for children, teenagers and adults on a flat route through several communities. Online registration is available until race day, with on-site late entries subject to a…",
    "Der Gäulauf in der Verbandsgemeinde Edenkoben ist ein traditionsreicher Volkslauf, der seit über zwei Jahrzehnten Läuferinnen und Läufer in Gommersheim zusammenbringt. Die Veranstaltung am 3. Juni 2026 bietet verschiedene Laufdistanzen für Kinder, Jugendliche und Erwachsene auf einer flachen Strecke durch mehrere Gemeinden. Die Anmeldung ist online bis zum Veranstaltungstag möglich, Nachmeldungen sind vor Ort mit ein"
  ],
  [
    "The 39th Gerolsteiner Stadtlauf takes place on 20 June 2026 at a new venue in Gerolstein-Roth. Construction work prevents it from being held in Gerolstein itself. The start and finish are at the sports ground, with refreshments, changing rooms and showers. The race is part of the 4-RegioCup, a series of twelve races in the Eifel, Mosel, Hochwald and Saar regions. Various distances are offered for…",
    "Der 39. Gerolsteiner Stadtlauf findet am 20. Juni 2026 an einem neuen Veranstaltungsort in Gerolstein-Roth statt. Aufgrund von Baumaßnahmen kann der Lauf nicht in Gerolstein selbst durchgeführt werden. Start und Ziel sind am Sportplatz mit Verpflegung, Umkleiden und Duschen. Der Lauf ist Teil des 4-RegioCups, einer Serie von 12 Läufen in den Regionen Eifel, Mosel, Hochwald und Saar. Es werden verschiedene Distanzen f"
  ],
  [
    "The Gettorfer Staffelmarathon is a team marathon taking place on 23 August 2026 at Sportpark Gettorf. The course is an approximately 4.2 km circuit completed ten times. Teams consist of five to ten people who pass a chipped baton in the changeover zone. Alternatively, two people can enter the duo marathon and divide the ten laps as they wish. Timing…",
    "Der Gettorfer Staffelmarathon ist ein Team-Marathon, der am 23. August 2026 im Sportpark Gettorf stattfindet. Die Strecke besteht aus einem ca. 4,2 km langen Rundkurs, der zehnmal gelaufen wird. Teams bestehen aus 5 bis 10 Personen, die den gechipten Staffelstab in der Wechselzone weitergeben. Alternativ kann der Duo-Marathon von zwei Personen bestritten werden, die sich die zehn Runden frei aufteilen. Die Zeitmessun"
  ],
  [
    "The Gladbecker Sparkassenlauf is a long-established running event welcoming runners of all ages. It offers distances from a young children's marathon to a half marathon, plus a team relay. All courses are DLV-certified and eligible for ranking lists. Participants receive finisher medals and personalized bib numbers bearing their names, making the experience particularly…",
    "Der Gladbecker Sparkassenlauf ist ein traditionsreiches Laufevent, das Läuferinnen und Läufer aller Altersklassen willkommen heißt. Die Veranstaltung bietet verschiedene Distanzen von Bambinimarathon bis Halbmarathon sowie eine Teamstaffel. Alle Strecken sind DLV-zertifiziert und bestenlistenfähig. Teilnehmer erhalten Finisher-Medaillen und personalisierte Startnummern mit ihrem Namen, was das Lauferlebnis besonders"
  ],
  [
    "The Globus-Theißen-Lauf is a community running event in Theißen, Saxony-Anhalt, holding its sixth edition on 21 June 2026. It offers courses for all ages, from young children's races through 1.5 km, 3 km, 7 km and 14 km. It takes place at Stadion der Bergarbeiter and is part of the adult Rangliste-Burgenland series and the Wiesen-Grundcup for children and teenagers. For…",
    "Der Globus-Theißen-Lauf ist ein gemeinschaftliches Laufereignis in Theißen, Sachsen-Anhalt, das am 21. Juni 2026 zum sechsten Mal stattfindet. Der Lauf bietet Strecken für alle Altersgruppen, von Bambini über 1,5 km, 3 km, 7 km bis hin zu 14 km. Die Veranstaltung findet im Stadion der Bergarbeiter statt und ist Teil der Rangliste-Burgenland für Erwachsene sowie des Wiesen-Grundcups für Kinder und Jugendliche. Für das"
  ],
  [
    "The 30th Gocher Steintorlauf takes place on 4 July 2026 as part of the Gocher Fußball Sommer. Organized by SV Viktoria Goch's athletics and running group, it expects more than 800 runners of different ages in central Goch. The programme ranges from young children's races and a 2,000 m recreational-group and corporate run to open races around the Steintor. The event…",
    "Der 30. Gocher Steintorlauf findet am 4. Juli 2026 im Rahmen des Gocher Fußball Sommers statt. Veranstaltet vom SV Viktoria Goch, Abteilung Leichtathletik/Lauftreff, werden über 800 Läuferinnen und Läufer verschiedener Altersgruppen im Stadtzentrum von Goch erwartet. Das Angebot reicht vom Bambini-Lauf über den 2.000m Hobbygruppen- und Firmenlauf bis hin zu Jedermann-Strecken rund um das Steintor. Die Veranstaltung b"
  ],
  [
    "The Gölitztallauf is an annual race in Marktgölitz, celebrating its 44th edition on 6 September 2026. It has four different courses, including a 1 km children's course. The event offers a friendly family atmosphere and awards for different age groups. Awards ceremonies take place shortly after each race to reduce waiting time for participants…",
    "Der Gölitztallauf ist ein jährlich stattfindender Lauf in Marktgölitz, der am 6. September 2026 seine 44. Auflage feiert. Der Lauf ist in vier verschiedene Strecken unterteilt, darunter eine Kinderstrecke über 1 km. Die Veranstaltung zeichnet sich durch eine familiäre Atmosphäre aus und bietet Ehrungen in verschiedenen Altersklassen. Die Siegerehrungen finden zeitnah nach den Läufen statt, um die Wartezeit für die Te"
  ],
  [
    "The Gosheimer Lemberglauf is a traditional race in Gosheim, Baden-Württemberg, and part of the Silberdistel-Albcup. It starts at the Kreissparkasse in the town centre and finishes on the Lemberg, with clothing transport available. It offers several distances, including school and young children's races and other events counting toward the cup's overall and club standings. For all participants…",
    "Der Gosheimer Lemberglauf ist ein traditionsreicher Lauf in Gosheim, Baden-Württemberg, der Teil des Silberdistel-Albcups ist. Die Strecke startet an der Kreissparkasse im Ortszentrum und führt zum Ziel auf dem Lemberg, mit einem Kleidertransport möglich. Der Lauf bietet verschiedene Distanzen, darunter Schüler- und Bambiniläufe sowie weitere Wettbewerbe, die zur Gesamt- und Vereinswertung des Cups zählen. Für alle T"
  ],
  [
    "The Grafschaftslauf links the historic towns of Rietberg, Verl and Schloß Holte-Stukenbrock, offering a varied route rich in history and atmosphere. It starts at Gut Rietberg, passes historic buildings and the town centre, and follows the Ems to the garden-show grounds. The course passes through atmospheric locations with several changeover points for relay runners and…",
    "Der Grafschaftslauf verbindet die historischen Städte Rietberg, Verl und Schloß Holte-Stukenbrock und bietet Läufern eine abwechslungsreiche Strecke mit viel Geschichte und Atmosphäre. Gestartet wird am Gut Rietberg, vorbei an historischen Gebäuden und durch die Innenstadt, weiter entlang der Ems bis zum Gartenschaugelände. Die Strecke führt durch stimmungsvolle Orte mit mehreren Wechselpunkten für Staffelläufer und"
  ],
  [
    "The H/21 Halbmarathon Hannover is a new event on the national running calendar, combining urban atmosphere, modern beats and green sections of the course. The start and finish are in central Hanover, and the route passes notable city landmarks. Held in autumn, it offers a special running experience in a lively city setting. Join the prologue as…",
    "Der H/21 Halbmarathon Hannover ist ein neues Laufevent im nationalen Veranstaltungskalender, das urbanes Flair, moderne Beats und grüne Streckenabschnitte verbindet. Start und Ziel liegen in der City von Hannover, und die Route führt entlang markanter Hotspots durch die Landeshauptstadt. Das Event findet im Herbst statt und bietet ein besonderes Lauferlebnis in einer lebendigen Stadtumgebung. Sei beim Prolog dabei, w"
  ],
  [
    "The Hahnenkammlauf in Edelsfeld is an idyllic woodland race holding its 23rd edition in 2026. It welcomes runners of all ages, from children to experienced athletes, with varied routes around the Hahnenkamm sports ground. The course has been adjusted because of sports-ground refurbishment. The race is part of the Amberg-Sulzbach district cup…",
    "Der Hahnenkammlauf in Edelsfeld ist ein idyllischer Waldlauf, der 2026 bereits in der 23. Auflage stattfindet. Die Veranstaltung richtet sich an Läufer aller Altersklassen, von Kindern bis zu erfahrenen Athleten, und bietet abwechslungsreiche Strecken rund um das Sportgelände am Hahnenkamm. Aufgrund der Sanierung des Sportplatzes wurde die Streckenführung angepasst. Der Lauf ist Teil des Landkreiscups Amberg-Sulzbach"
  ],
  [
    "The Hahner Kitzenhauslauf is a popular running event near the German, Belgian and Dutch borders. Its hilly, varied routes through natural surroundings in southern Aachen offer a demanding and scenic experience. The event has a long tradition, attracting runners from the region and beyond. It is known for its friendly family atmosphere and…",
    "Der Hahner Kitzenhauslauf ist eine beliebte Laufveranstaltung im Dreiländereck Deutschland, Belgium und Niederlande. Die naturnahen, hügeligen und abwechslungsreichen Strecken im Aachener Süden bieten Läufern ein anspruchsvolles und landschaftlich reizvolles Erlebnis. Die Veranstaltung hat eine lange Tradition und zieht Läufer aus der Region und darüber hinaus an. Sie ist bekannt für ihre familiäre Atmosphäre und die"
  ],
  [
    "The Halderner Volkslauf is a traditional race bringing together young and old, encouraging a sense of community among friends and families. It returns on 28 June 2026, with the half marathon remaining permanently in the programme following positive feedback. The event offers a welcoming atmosphere for runners of all abilities.",
    "Der Halderner Volkslauf ist ein traditionsreicher Lauf, der Jung und Alt zusammenbringt und das Gemeinschaftsgefühl von Freunden und Familien fördert. Am 28. Juni 2026 findet die Veranstaltung erneut statt, wobei der Halbmarathon aufgrund der positiven Resonanz dauerhaft im Programm bleibt. Die Veranstaltung bietet eine freundliche Atmosphäre für Läufer aller Leistungsstufen und lädt zur Teilnahme ein."
  ],
  [
    "The Hardtwaldlauf in Karlsruhe is a traditional running event holding its 40th edition on 28 June 2026. The 5 km and 10 km courses pass through the Hardtwald and suit recreational runners and ambitious athletes alike. The event provides professional timing with disposable transponders and a friendly atmosphere, with certificates and prizes for various…",
    "Der Hardtwaldlauf in Karlsruhe ist ein traditionsreicher Laufwettbewerb, der am 28. Juni 2026 zum 40. Mal stattfindet. Angeboten werden Läufe über 5 km und 10 km, die durch den Hardtwald führen und sowohl für Freizeitläufer als auch für ambitionierte Sportler geeignet sind. Die Veranstaltung bietet eine professionelle Zeitnahme mit Einweg-Transpondern und eine freundliche Atmosphäre mit Urkunden und Preisen für versc"
  ],
  [
    "The 20th running and music festival in Harsefeld takes place on 13 June 2026, combining sporting challenges with musical entertainment. Runners of all ages can enter various distances, from children's and youngest runners' races to short-distance, long-distance and relay events. In the evening, Marktstraße becomes a lively party area with an open-air disco and live music.",
    "Das 20. Lauf- und Musikfestival in Harsefeld findet am 13. Juni 2026 statt und verbindet sportliche Herausforderungen mit musikalischer Unterhaltung. Läufer:innen aller Altersgruppen können an verschiedenen Distanzen teilnehmen, von Kinder- und Bambiniläufen bis hin zu Kurz-, Langstrecken und Staffelwettbewerben. Am Abend verwandelt sich die Marktstraße in eine lebendige Partymeile mit Open-Air-Disco und Live-Musik."
  ],
  [
    "The Harzgeröder Klippenlauf on 7 June 2026 is a varied community and cross-country race in the Lower Harz, suitable for runners of all abilities. Distances range from 1 km for children to a demanding 21.1 km half marathon with 450 m of ascent. The routes follow the Selketalstieg through the Selke valley, past Mägdesprung and Alexisbad, with rocky sections and narrow…",
    "Der Harzgeröder Klippenlauf am 7. Juni 2026 ist ein vielseitiger Volks- und Crosslauf im Unterharz, der für Läufer aller Leistungsstufen geeignet ist. Angeboten werden Strecken von 1 km für Kinder bis hin zum anspruchsvollen Halbmarathon mit 21,1 km und 450 Höhenmetern. Die Läufe führen durch das Selketal entlang des Selketalstiegs, vorbei an den Ortsteilen Mägdesprung und Alexisbad, mit felsigen Abschnitten, schmale"
  ],
  [
    "The Hausener Volks-Waldlauf organized by TGS Hausen takes place on 26 July 2026, with a half marathon, 10 km, 5 km and shorter school and young children's races. All races start and finish at the TGS Hausen sports ground in Obertshausen. The routes predominantly follow well-marked, level woodland paths, with the half marathon run as two 10 km laps. The…",
    "Der Hausener Volks-Waldlauf der TGS Hausen findet am 26. Juli 2026 statt und bietet Läufen auf verschiedenen Distanzen, darunter Halbmarathon, 10 km, 5 km sowie kürzere Schüler- und Bambini-Läufe. Start und Ziel sind jeweils am Sportplatz der TGS Hausen in Obertshausen. Die Strecken verlaufen überwiegend auf gut gekennzeichneten, ebenen Waldwegen, wobei der Halbmarathon als zweimalige 10-km-Runde gelaufen wird. Die Z"
  ],
  [
    "The Heideköniginnenpokal (HeiPo) in Amelinghausen is a traditional community race holding its 31st edition in 2026 during the heather festival week. The demanding routes pass through attractive scenery, including sections alongside Lopausee. The race attracts many participants and is an established part of the region's running calendar.",
    "Der Heideköniginnenpokal (HeiPo) in Amelinghausen ist ein traditionsreicher Volkslauf, der 2026 zum 31. Mal im Rahmen der Heideblütenfestwoche stattfindet. Die anspruchsvollen Strecken führen durch landschaftlich reizvolle Passagen, unter anderem entlang des Lopausees. Der Lauf zieht viele Teilnehmerinnen und Teilnehmer an und ist ein fester Bestandteil der regionalen Laufveranstaltungen."
  ],
  [
    "The Heider Abend-Stadtlauf is a traditional race in Heide, organized by MTV von 1860 e.V. Heide. Runners of different abilities can compete on an attractive route through the town. The event is known for its friendly family atmosphere and support from the local sports club. The course is well marked and offers a varied…",
    "Der Heider Abend-Stadtlauf ist ein traditionsreicher Lauf in Heide, der von MTV von 1860 e.V. Heide veranstaltet wird. Die Veranstaltung bietet Läufern verschiedener Leistungsstufen die Möglichkeit, auf einer attraktiven Strecke durch die Stadt anzutreten. Der Lauf zeichnet sich durch eine familiäre Atmosphäre und die Unterstützung durch den lokalen Sportverein aus. Die Strecke ist gut markiert und bietet ein abwechs"
  ],
  [
    "The 49th Ötigheimer Herbstlauf on 26 September 2026 welcomes runners of all abilities. Whether beginners or ambitious runners, enjoyment of movement comes first. It offers children's and school races, plus officially measured 5 km and 10 km main races. The 10 km course follows two laps through the Ötigheim woods, promising an attractive autumn running atmosphere…",
    "Der 49. Ötigheimer Herbstlauf am 26. September 2026 lädt Laufbegeisterte aller Leistungsstufen herzlich ein. Ob Anfänger oder ambitionierter Läufer, der Spaß an der Bewegung steht im Vordergrund. Angeboten werden Kinder- und Schülerläufe sowie Hauptläufe über 5 km und 10 km, die amtlich vermessen sind. Die 10 km Strecke führt über zwei Runden durch den Ötigheimer Wald und verspricht eine schöne herbstliche Laufatmosp"
  ],
  [
    "The DJK Feudenheim Herbstlauf is a traditional running event in Mannheim-Feudenheim, holding its 35th edition on 17 October 2026. The main race covers 10 km in three laps, with a 90-minute time limit. There is also an open race and races for schoolchildren, young children and inclusion. The event offers a friendly family…",
    "Der Herbstlauf der DJK Feudenheim ist eine traditionsreiche Laufveranstaltung in Mannheim-Feudenheim, die am 17. Oktober 2026 zum 35. Mal stattfindet. Der Hauptlauf umfasst eine 10-km-Strecke, die in drei Runden zu absolvieren ist, mit einer Zeitbegrenzung von 90 Minuten. Neben dem Hauptlauf gibt es auch einen Jedermannlauf sowie weitere Läufe für Schüler, Bambini und Inklusion. Die Veranstaltung bietet eine familiär"
  ],
  [
    "The Herbstlauf Niederwangen takes place on 4 October 2026 as an annual fixture in the Voralpen VBAO Cup. It offers a quarter-marathon distance and is known for its cup competition, with the overall awards ceremony held at this race. It welcomes runners of all abilities and is an established regional running event.",
    "Der Herbstlauf Niederwangen findet jährlich am 4. Oktober 2026 statt und ist Teil des Voralpen VBAO Cups. Der Lauf bietet eine Viertelmarathon-Distanz und ist bekannt für seine attraktive Cupwertung, bei der die Gesamtsiegerehrung beim Herbstlauf erfolgt. Die Veranstaltung richtet sich an Läufer aller Leistungsstufen und ist ein fester Bestandteil der regionalen Laufveranstaltungen."
  ],
  [
    "The Herner St. Martini City-Lauf takes place on 27 September 2026 on Bahnhofstraße boulevard in Herne. The programme includes races for all ages from young children to adults, with distances from approximately 400 m to 5 km. The courses are officially measured and raced under official supervision. Timing uses the electronic easychip system, and all participants receive…",
    "Der Herner St. Martini City-Lauf findet am 27. September 2026 auf dem Boulevard Bahnhofstraße in Herne statt. Die Veranstaltung bietet verschiedene Läufe für alle Altersklassen, von Bambini bis zu Erwachsenen, mit Streckenlängen von ca. 400 m bis 5 km. Die Laufstrecken sind amtlich vermessen und werden unter offizieller Aufsicht durchgeführt. Die Zeitnahme erfolgt elektronisch per easychip, und alle Teilnehmer erhalt"
  ],
  [
    "The Heuchelheimer Mitternachtslauf is a traditional race in Heuchelheim, taking place on 20 June 2026. Distances cater to young children, schoolchildren, recreational runners and relay teams, alongside the main 10 km race. The course runs through Heuchelheim's streets with some climbs, particularly at Mühlberg. All participants receive medals and certificates, and registration is…",
    "Der Heuchelheimer Mitternachtslauf ist ein traditionsreicher Lauf in Heuchelheim, der am 20. Juni 2026 stattfindet. Die Veranstaltung bietet verschiedene Distanzen für Bambini, Schüler, Jedermann, Staffeln und den Hauptlauf über 10 Kilometer. Die Strecke führt durch die Straßen Heuchelheims mit einigen Steigungen, insbesondere am Mühlberg. Für alle Teilnehmer gibt es Medaillen und Urkunden, und die Anmeldung erfolgt"
  ],
  [
    "The Heumadener Volkslauf has taken place annually in Stuttgart-Heumaden since 2009, offering three distances: 5.5 km, 10.3 km and, since 2018, a 21 km half marathon. The route is a long, mostly flat circuit with few climbs, passing through Heumaden, Riedenberg and Kemnat. The start and finish are at the Untere Hasenwedel sports ground. The event is part of…",
    "Der Heumadener Volkslauf findet seit 2009 jährlich in Stuttgart-Heumaden statt und bietet Läufern drei Streckenlängen: 5,5 km, 10,3 km und seit 2018 auch einen Halbmarathon über 21 km. Die Strecke ist ein langer, eher flacher Rundkurs mit wenigen Steigungen, der durch die Stadtteile Heumaden, Riedenberg und Kemnat führt. Start und Ziel befinden sich auf dem Sportgelände Untere Hasenwedel. Die Veranstaltung ist Teil d"
  ],
  [
    "The Hockenheimringlauf 2026 offers runners of all abilities a distinctive experience on one of the world's most legendary motor-racing circuits. The flat asphalt course, sweeping bends and Formula 1 atmosphere make it a special event for professional and recreational runners. Alongside races for children and adults, participants can expect a friendly, motivating atmosphere with refreshments…",
    "Der Hockenheimringlauf 2026 bietet Läufern aller Leistungsstufen ein einzigartiges Erlebnis auf einer der legendärsten Rennstrecken der Welt. Die flache Asphaltstrecke mit weiten Kurven und der Atmosphäre der Formel 1 macht den Lauf zu einem besonderen Event für Profi- und Hobbyläufer. Neben spannenden Wettkämpfen für Kinder und Erwachsene erwartet die Teilnehmer eine freundliche und motivierende Atmosphäre mit Verpf"
  ],
  [
    "The Hofheimer Volkslauf is a traditional running event taking place on 26 September 2026 at Sportpark Hofheim in Lampertheim-Hofheim. Organized by Turnverein 1896 Hofheim im Ried e.V., it offers runners of all ages a welcoming family atmosphere. The event is known for good organization and the opportunity to enjoy sport and community…",
    "Der Hofheimer Volkslauf ist eine traditionsreiche Laufveranstaltung, die am 26. September 2026 im Sportpark Hofheim in Lampertheim-Hofheim stattfindet. Der Lauf wird vom Turnverein 1896 Hofheim im Ried e.V. organisiert und bietet Läufern aller Altersklassen eine freundliche und familiäre Atmosphäre. Die Veranstaltung ist bekannt für ihre gute Organisation und die Möglichkeit, sich sportlich zu betätigen und Gemeinsch"
  ],
  [
    "The Hohenlockstedter Pellkartoffellauf is a traditional running event held annually on the Pohl-Boskamp grounds since 2002. Distances of 2.8 km, 5 km and 10 km provide challenges for beginners and experienced runners alike. Special races for young children and a varied supporting programme make the event particularly family-friendly…",
    "Der Hohenlockstedter Pellkartoffellauf ist ein traditionsreiches Laufevent, das seit 2002 jährlich auf dem Pohl-Boskamp Gelände stattfindet. Mit Streckenlängen von 2,8 km, 5 km und 10 km bietet der Lauf sowohl Anfängern als auch erfahrenen Läufern eine passende Herausforderung. Besonders familienfreundlich gestaltet sich das Event durch spezielle Bambini-Läufe für Kinder und ein abwechslungsreiches Rahmenprogramm mit"
  ],
  [
    "The 37th Hohenneuffen-Berglauf takes place on 14 June 2026 in Linsenhofen, finishing at Hohenneuffen Castle. The main course covers 9.3 km with approximately 535 m of ascent and 180 m of descent. There is also the 24th school mountain race, offering different distances and elevation gains for children from first grade. It starts at the town hall in Balzholz and finishes at the kindergarten on Jahnstraße. We…",
    "Der 37. Hohenneuffen-Berglauf findet am 14. Juni 2026 in Linsenhofen mit Ziel auf der Burg Hohenneuffen statt. Die Hauptstrecke umfasst 9,3 km mit etwa 535 Höhenmetern im Aufstieg und 180 Höhenmetern im Abstieg. Zusätzlich gibt es den 24. Schüler-Berglauf mit verschiedenen Distanzen und Höhenmetern, der ab der 1. Klasse offen ist. Der Start erfolgt in Balzholz am Rathaus, das Ziel liegt am Kindergarten Jahnstraße. Wi"
  ],
  [
    "The 46th Koberstädter Waldmarathon takes place on 30 August 2026 in Egelsbach. The programme includes a young children's race, 5 km, 10 km and a half marathon.",
    "Der 46. Koberstädter Waldmarathon findet am 30. August 2026 in Egelsbach statt. Das Programm umfasst Bambinilauf, 5 km, 10 km und Halbmarathon."
  ],
  [
    "The Köln Triathlon takes place on 6 September 2026, with swimming in the Rhine, cycling along the riverbank and a run toward Cologne Cathedral. It offers sprint, Olympic and middle distances, plus Olympic- and middle-distance relays. The organizer reports that the 2026 edition is sold out.",
    "Der Köln Triathlon findet am 6. September 2026 mit Schwimmen im Rhein, Radfahren am Rheinufer und dem Lauf in Richtung Kölner Dom statt. Angeboten werden Sprint-, olympische und Mitteldistanz sowie Staffeln über die olympische und die Mitteldistanz. Der Veranstalter meldet die Ausgabe 2026 als ausverkauft."
  ],
  [
    "The 27th Kölner Halbmarathon starts on 30 August 2026 at the German Sport University Cologne. Depending on the number of laps, participants can cover 7 km, 14 km, 21 km or 28 km. A limited number of remaining places has been announced for late entries.",
    "Der 27. Kölner Halbmarathon startet am 30. August 2026 an der Deutschen Sporthochschule Köln. Je nach Rundenzahl sind 7 km, 14 km, 21 km oder 28 km möglich. Für Nachmeldungen wurde ein begrenztes Restkontingent angekündigt."
  ],
  [
    "The Usedom-Marathon takes place on 5 September 2026. The marathon and five-person relay run from Świnoujście to Wolgast; the half marathon starts and finishes at Peene-Stadion Wolgast.",
    "Der Usedom-Marathon findet am 5. September 2026 statt. Marathon und Fünferstaffel führen von Świnoujście nach Wolgast; der Halbmarathon startet und endet im Peene-Stadion Wolgast."
  ]
];
  if (typeof module === "object" && module.exports) module.exports = pairs;
  else root.SportEventMapDescriptionTranslations = [...(root.SportEventMapDescriptionTranslations || []), ...pairs];
})(typeof globalThis !== "undefined" ? globalThis : this);
