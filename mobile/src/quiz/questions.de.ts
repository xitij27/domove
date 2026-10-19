// The questions in German, by id. Options keep the English order, since a choice's answer is its index.
// A blank's German answers come first, so a wrong guess is shown the German one; the English ones still count.

export type Translation = { prompt: string; options?: string[]; answers?: string[]; fact: string };

export const QUESTIONS_DE: Record<string, Translation> = {
  // die Stadt
  'bvb-founded': {
    prompt: 'Borussia Dortmund wurde im Jahr ___ gegründet.',
    fact: 'Der BVB wurde am 19. Dezember 1899 in einer Kneipe nahe dem Borsigplatz gegründet, wo die Mannschaft bis heute ihre Titel feiert.',
  },
  'yellow-wall': {
    prompt: 'Die Fans nennen die Südtribüne des BVB, die größte Stehplatztribüne Europas, die Gelbe ___.',
    answers: ['Wand', 'Gelbe Wand'],
    fact: 'Auf der Gelben Wand haben rund 25.000 Fans Platz – im Stehen.',
  },
  westfalenstadion: {
    prompt: 'Bevor es den Namen eines Sponsors trug, hieß der Signal Iduna Park ___.',
    fact: 'Es wurde 1974 zur Weltmeisterschaft eröffnet. Mit rund 81.000 Plätzen bei Ligaspielen fasst es mehr Menschen als jedes andere Stadion in Deutschland.',
  },
  'phoenix-see': {
    prompt: 'Der Phoenix-See in Hörde wurde dort ausgehoben, wo früher …',
    options: ['eine Zeche lag', 'ein Stahlwerk stand', 'ein Flugplatz war', 'eine Brauerei stand'],
    fact: 'Das Stahlwerk Phoenix-Ost schloss 2001. 2010 begann die Flutung, und heute ist der See von Wohnhäusern, Cafés und einem Rundweg umgeben.',
  },
  'dortmunder-u': {
    prompt: 'Das Dortmunder U mit dem großen goldenen U auf dem Dach war früher …',
    options: ['ein Bahnhof', 'eine Bank', 'ein Verwaltungsgebäude eines Stahlwerks', 'eine Brauerei'],
    fact: 'Es war das Gebäude der Union-Brauerei. Heute ist es ein Zentrum für Kunst und Kreativität und beherbergt das Museum Ostwall.',
  },
  florianturm: {
    prompt: 'In welchem Park steht der Florianturm, Dortmunds Fernsehturm?',
    options: ['Rombergpark', 'Fredenbaumpark', 'Westfalenpark', 'Revierpark Wischlingen'],
    fact: 'Er wurde für die Bundesgartenschau 1959 gebaut und hat eine Aussichtsplattform hoch über der Stadt.',
  },
  'largest-city': {
    prompt: 'Dortmund ist die größte Stadt welcher Region?',
    options: ['des Ruhrgebiets', 'des Rheinlands', 'des Sauerlands', 'des Münsterlands'],
    fact: 'Mit rund 600.000 Menschen ist Dortmund die größte Stadt sowohl im Ruhrgebiet als auch in Westfalen.',
  },
  state: {
    prompt: 'Dortmund liegt im Bundesland ___.',
    answers: ['Nordrhein-Westfalen', 'NRW'],
    fact: 'Die Landeshauptstadt ist Düsseldorf. Nur Köln und Düsseldorf haben mehr Einwohner als Dortmund.',
  },
  hanseatic: {
    prompt: 'Welchem Handelsbund gehörte Dortmund im Mittelalter an?',
    options: ['dem Schwäbischen Städtebund', 'der Hanse', 'dem Lombardischen Städtebund', 'der Eidgenossenschaft'],
    fact: 'Dortmund war außerdem Freie Reichsstadt und unterstand nur dem Kaiser – deshalb trägt das Stadtwappen einen Adler.',
  },
  'patron-saint': {
    prompt: 'Wer ist der Stadtpatron von Dortmund?',
    options: ['die heilige Ursula', 'der heilige Liborius', 'der heilige Quirinus', 'der heilige Reinoldus'],
    fact: 'Nach ihm ist die Reinoldikirche in der Innenstadt benannt. Ursula ist Patronin von Köln, Liborius von Paderborn und Quirinus von Neuss.',
  },
  hellweg: {
    prompt: 'Dortmunds Haupteinkaufsstraße, der Westenhellweg, folgt einer alten …',
    options: ['Stadtmauer', 'Flussniederung', 'Handelsstraße', 'Eisenbahnlinie'],
    fact: 'Der Hellweg führte vom Rhein über Dortmund nach Paderborn und war einer der verkehrsreichsten Handelswege im mittelalterlichen Deutschland.',
  },
  wall: {
    prompt: 'Der Ring um Dortmunds Innenstadt heißt „Wall“. Warum?',
    options: ['Er folgt der alten Stadtmauer', 'Er wurde als Hochwasserschutz gebaut', 'Er ist nach einem Bürgermeister benannt', 'Er verläuft entlang eines Kanals'],
    fact: 'Seine Abschnitte tragen die alten Namen, etwa Königswall, Burgwall, Ostwall, Südwall und Schwanenwall.',
  },
  districts: {
    prompt: 'In wie viele Stadtbezirke ist Dortmund eingeteilt?',
    fact: 'Drei bilden die Innenstadt (West, Nord und Ost). Die anderen sind Aplerbeck, Brackel, Eving, Hombruch, Hörde, Huckarde, Lütgendortmund, Mengede und Scharnhorst.',
  },
  'football-museum': {
    prompt: 'Welches Museum steht gegenüber dem Dortmunder Hauptbahnhof?',
    options: ['das Deutsche Bergbau-Museum', 'das Deutsche Fußballmuseum', 'das Ruhr Museum', 'das Deutsche Technikmuseum'],
    fact: 'Das Deutsche Fußballmuseum wurde 2015 eröffnet. Das Bergbau-Museum steht in Bochum, das Ruhr Museum in Essen.',
  },
  zollern: {
    prompt: 'Die Zeche Zollern in Bövinghausen ist berühmt für ihre Maschinenhalle in welchem Stil?',
    options: ['Gotik', 'Barock', 'Bauhaus', 'Jugendstil'],
    fact: 'Zollern ist heute eines der LWL-Industriemuseen und ein Ankerpunkt der Route der Industriekultur.',
  },
  'canal-port': {
    prompt: 'Der Dortmunder Hafen ist der größte Kanalhafen Europas. Welcher Kanal verbindet ihn mit der Nordsee?',
    options: ['der Dortmund-Ems-Kanal', 'der Rhein-Herne-Kanal', 'der Mittellandkanal', 'der Nord-Ostsee-Kanal'],
    fact: 'Der Kanal wurde 1899 eröffnet – im selben Jahr, in dem der BVB gegründet wurde – und führt nach Emden an der Ems.',
  },
  'export-beer': {
    prompt: 'Dortmunds klassischer Bierstil heißt Dortmunder ___.',
    fact: 'Dortmund braute einst mehr Bier als jede andere Stadt in Europa.',
  },
  'christmas-tree': {
    prompt: 'Was hat der Weihnachtsmarkt auf dem Hansaplatz nach eigenen Angaben?',
    options: ['den ältesten Weihnachtsmarkt', 'eine Eisbahn auf einem See', 'den größten Weihnachtsbaum', 'die längste Glühweintheke'],
    fact: 'Der Baum ist rund 45 Meter hoch und besteht aus etwa 1.700 Fichten auf einem Stahlgerüst.',
  },
  emscher: {
    prompt: 'Welcher Fluss, einst ein offener Abwasserkanal, entspringt bei Dortmund und ist wieder sauber?',
    options: ['die Ruhr', 'die Lippe', 'die Wupper', 'die Emscher'],
    fact: 'Seit 2021 ist die Emscher abwasserfrei; das Abwasser fließt jetzt durch einen über 50 km langen Kanal neben ihr.',
  },
  hohensyburg: {
    prompt: 'Auf der Hohensyburg, über der Ruhr und dem Hengsteysee, findest du …',
    options: ['den Zoo', 'eine Spielbank und ein Denkmal für Kaiser Wilhelm I.', 'die Westfalenhallen', 'den Flughafen'],
    fact: 'Dort steht auch die Ruine der Syburg. Karl der Große nahm die Burg 775 den Sachsen ab.',
  },
  rombergpark: {
    prompt: 'Welcher Dortmunder Park ist ein botanischer Garten mit Arboretum und Tropenhäusern?',
    options: ['Westfalenpark', 'Fredenbaumpark', 'Hoeschpark', 'Rombergpark'],
    fact: 'Er begann als Park des Schlosses der Familie von Romberg in Brünninghausen. Der Zoo liegt direkt nebenan.',
  },
  'airport-code': {
    prompt: 'Der dreibuchstabige Code des Dortmunder Flughafens lautet ___.',
    fact: 'Der Flughafen liegt in Wickede, im Osten der Stadt.',
  },

  // unterwegs
  'h-bahn': {
    prompt: 'Die H-Bahn an der TU Dortmund ist …',
    options: ['ein Wasserstoffbus', 'eine Hängebahn', 'eine Radschnellspur', 'eine Seilbahn'],
    fact: 'Ihre Kabinen hängen unter einer Schiene, fahren ohne Fahrer und verbinden den Nord- und den Südcampus der Universität.',
  },
  dsw21: {
    prompt: 'Dortmunds Stadtbahn und Stadtbusse werden betrieben von ___.',
    fact: 'Ihre Stadtbahnlinien tragen die Nummern U41 bis U49 und fahren in der Innenstadt unterirdisch.',
  },
  deutschlandticket: {
    prompt: 'Mit welchem Ticket fährst du für einen Monatspreis mit Bussen und Bahnen im Nahverkehr in ganz Deutschland?',
    options: ['dem Schöner-Tag-Ticket NRW', 'der Kurzstrecke', 'dem Deutschlandticket', 'eezy.nrw'],
    fact: 'Es gilt in Bussen, Straßenbahnen, der Stadtbahn und Regionalzügen, aber nicht im ICE, IC oder EC.',
  },
  'bike-share': {
    prompt: 'Wie heißt das Leihradsystem in Dortmund und im übrigen Ruhrgebiet?',
    options: ['metropolradruhr', 'Call a Bike', 'RuhrRad', 'StadtRad'],
    fact: 'Du leihst die Räder per App, und die Stationen verteilen sich über die Städte des Ruhrgebiets, nicht nur über Dortmund.',
  },
  ruhrschnellweg: {
    prompt: 'Welche Autobahn, der Ruhrschnellweg, führt von Dortmund nach Westen durch das Ruhrgebiet?',
    options: ['die A1', 'die A2', 'die A45', 'die A40'],
    fact: 'In Dortmund geht sie als B1 weiter. Die A45, die Sauerlandlinie, führt nach Süden durch das Sauerland.',
  },
  'roadworks-sign': {
    prompt: 'Ein rotes Dreieck mit einer Person, die gräbt, bedeutet …',
    options: ['Baustelle voraus', 'Spielplatz in der Nähe', 'landwirtschaftliche Fahrzeuge', 'Steinschlag'],
    fact: 'Es ist Zeichen 123, Arbeitsstelle. Rechne mit schmaleren Fahrstreifen, einem niedrigeren Tempolimit und Menschen, die nah an der Fahrbahn arbeiten.',
  },
  'yellow-lines': {
    prompt: 'An einer Baustelle hat die Straße weiße und gelbe Fahrbahnmarkierungen. Welchen folgst du?',
    options: ['den weißen', 'den gelben', 'denen auf der linken Seite', 'keinen'],
    fact: 'Gelbe Markierungen sind vorübergehend und gehen den weißen vor, solange die Arbeiten dauern.',
  },
  'detour-sign': {
    prompt: 'Welche Farbe haben die vorübergehenden Umleitungsschilder an Baustellen?',
    options: ['blau', 'grün', 'weiß', 'gelb'],
    fact: 'Gelb mit schwarzen Pfeilen und schwarzer Schrift, damit sie sich von den dauerhaften blauen und weißen Schildern abheben.',
  },
  'no-entry': {
    prompt: 'Ein roter Kreis mit einem weißen Querbalken bedeutet …',
    options: ['Halteverbot', 'Verbot der Einfahrt', 'Ende aller Streckenverbote', 'Verbot für Radverkehr'],
    fact: 'Es ist Zeichen 267. An Baustellen sperrt es oft ein Ende einer Straße, die vorübergehend zur Einbahnstraße wird.',
  },
  'closed-to-vehicles': {
    prompt: 'Ein weißer Kreis mit rotem Rand und ohne Inhalt bedeutet …',
    options: ['Verbot für Fahrzeuge aller Art', 'Ende der Geschwindigkeitsbegrenzung', 'Parken erlaubt', 'Vorfahrtstraße'],
    fact: 'Es ist Zeichen 250. Zu Fuß darfst du trotzdem durch, und mit dem Rad auch, wenn du schiebst.',
  },
  'zip-merge': {
    prompt: 'Endet an einer Baustelle ein Fahrstreifen, fahren alle auf beiden Streifen bis zum Ende und fädeln dann abwechselnd ein. Das nennt man ___.',
    answers: ['Reißverschlussverfahren', 'Reißverschluss', 'Reißverschlussprinzip'],
    fact: 'Die Straßenverkehrsordnung verlangt das abwechselnde Einfädeln genau dort, wo der Streifen endet. Früh einzufädeln macht den Stau nur länger.',
  },
  'emergency-corridor': {
    prompt: 'Im Stau auf der Autobahn müssen Autofahrer eine Gasse für Rettungswagen und Feuerwehr freihalten. Sie heißt ___.',
    fact: 'Sie liegt zwischen dem ganz linken Fahrstreifen und dem daneben und muss gebildet werden, sobald der Verkehr nur noch Schritttempo fährt – nicht erst, wenn Sirenen zu hören sind.',
  },
  'town-speed': {
    prompt: 'Wenn Schilder nichts anderes sagen, gilt innerorts in Deutschland Tempo ___ km/h.',
    fact: 'Viele Wohnstraßen sind Tempo-30-Zonen, und an Baustellen senken Schilder das Limit oft weiter.',
  },
};
