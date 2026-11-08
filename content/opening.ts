// Opening Collection: the 36 user-selected exhibits get an installation
// concept, a short "why it matters" and a bespoke painting motif.

export type Motif =
  | "chess" | "workbench" | "voice" | "roots" | "deploy" | "wave" | "workshop"
  | "send" | "constellation" | "sculpture" | "recursive" | "threads" | "reel"
  | "branches" | "pages" | "editor" | "containers" | "cloud" | "bridge"
  | "cabinet" | "search" | "screen" | "film" | "filter" | "chip" | "window"
  | "terminal" | "foundation" | "transform" | "flame" | "diorama" | "tables"
  | "circuit" | "vault";

export interface OpeningExtra {
  motif: Motif;
  installation: { en: string; ar: string };
  why: { en: string; ar: string };
}

export const OPENING: Record<string, OpeningExtra> = {
  stockfish: {
    motif: "chess",
    installation: { en: "A chess table with a living evaluation line", ar: "طاولة شطرنج يتحرك فوقها خط تقييم حي" },
    why: { en: "Thousands of volunteers donate computer time to test every improvement. The strongest chess player on Earth is free for anyone.",
      ar: "آلاف المتطوعين يتبرعون بوقت حواسيبهم لاختبار كل تحسين. أقوى لاعب شطرنج على الأرض متاح مجانًا للجميع." },
  },
  "t3-code": {
    motif: "workbench",
    installation: { en: "Coding agents pictured as parallel workbenches", ar: "وكلاء البرمجة كطاولات عمل متوازية" },
    why: { en: "Instead of juggling separate apps, you watch several AI helpers work side by side in one calm place.",
      ar: "بدل التنقل بين تطبيقات كثيرة، تتابع عدة مساعدين أذكياء يعملون جنبًا إلى جنب في مكان واحد هادئ." },
  },
  handy: {
    motif: "voice",
    installation: { en: "A microphone turning speech into floating lettering", ar: "ميكروفون يحوّل الكلام إلى حروف طائرة" },
    why: { en: "Your voice never has to leave your computer. It helps anyone who finds typing slow, tiring or painful.",
      ar: "صوتك لا يغادر حاسوبك أبدًا. يساعد كل من يجد الكتابة بطيئة أو متعبة أو مؤلمة." },
  },
  linux: {
    motif: "roots",
    installation: { en: "A sculpture of roots supporting a digital city", ar: "منحوتة جذور تحمل مدينة رقمية" },
    why: { en: "Started as a student's hobby in 1991, it now quietly runs most of the internet, every Android phone and the fastest supercomputers.",
      ar: "بدأ كهواية طالب سنة 1991، والآن يشغّل بهدوء معظم الإنترنت وكل هواتف أندرويد وأسرع الحواسيب العملاقة." },
  },
  coolify: {
    motif: "deploy",
    installation: { en: "A tiny web app gently being deployed into a glowing server", ar: "تطبيق صغير يُنشر برفق داخل خادم مضيء" },
    why: { en: "It gives you the convenience of paid hosting platforms on a server you own, without monthly lock-in.",
      ar: "يمنحك سهولة منصات الاستضافة المدفوعة على خادم تملكه، بدون التزام شهري." },
  },
  audacity: {
    motif: "wave",
    installation: { en: "A waveform transformed into an illustrated landscape", ar: "موجة صوتية تتحول إلى منظر طبيعي مرسوم" },
    why: { en: "For over twenty years, podcasters, musicians and students have recorded and cleaned up sound with it for free.",
      ar: "منذ أكثر من عشرين سنة يستخدمه أصحاب البودكاست والموسيقيون والطلاب لتسجيل الصوت وتنقيته مجانًا." },
  },
  "artcraft-crafting-apps": {
    motif: "workshop",
    installation: { en: "A workshop wall of independent creative instruments", ar: "جدار ورشة عليه أدوات إبداعية مستقلة" },
    why: { en: "A whole family of small, focused creative tools, built in the open so anyone can learn from them and help shape them.",
      ar: "عائلة كاملة من أدوات إبداعية صغيرة ومركّزة، مبنية علنًا ليتعلم منها أي أحد ويشارك في تشكيلها." },
  },
  localsend: {
    motif: "send",
    installation: { en: "Two nearby devices quietly sending a glowing file", ar: "جهازان متجاوران يرسلان ملفًا مضيئًا بهدوء" },
    why: { en: "Phone to laptop, Windows to Mac, Android to iPhone. No cables, no accounts, and your files never touch the internet.",
      ar: "من الهاتف للحاسوب، من ويندوز لماك، من أندرويد لآيفون. بدون أسلاك ولا حسابات، وملفاتك لا تمر عبر الإنترنت." },
  },
  immich: {
    motif: "constellation",
    installation: { en: "A constellation of personal photographs", ar: "كوكبة من الصور الشخصية" },
    why: { en: "Your family photos stay on your own machine, with the face search and phone backup you expect from big cloud services.",
      ar: "صور عائلتك تبقى على جهازك أنت، مع البحث بالوجوه والنسخ الاحتياطي من الهاتف كما في الخدمات السحابية الكبيرة." },
  },
  blender: {
    motif: "sculpture",
    installation: { en: "An animated sculpture rotating in soft gallery light", ar: "منحوتة متحركة تدور في ضوء هادئ" },
    why: { en: "Films, games and art studios use it every day. Its community once bought the code so it could be free forever.",
      ar: "تستخدمه استوديوهات الأفلام والألعاب والفن كل يوم. مجتمعه اشترى الشيفرة يومًا ما لتبقى مجانية للأبد." },
  },
  "obs-studio": {
    motif: "recursive",
    installation: { en: "A recursive screen capturing its own exhibit", ar: "شاشة تصوّر نفسها إلى ما لا نهاية" },
    why: { en: "Most of the streams and screen recordings you watch online were made with it, free of charge.",
      ar: "معظم البثوث وتسجيلات الشاشة التي تشاهدها على الإنترنت صُنعت به مجانًا." },
  },
  syncthing: {
    motif: "threads",
    installation: { en: "Devices connected with synchronized visual threads", ar: "أجهزة متصلة بخيوط متزامنة" },
    why: { en: "Your folders stay the same on every device, and no company ever holds a copy.",
      ar: "مجلداتك تبقى متطابقة على كل أجهزتك، ولا تحتفظ أي شركة بنسخة منها." },
  },
  vlc: {
    motif: "reel",
    installation: { en: "A cinematic film-reel installation", ar: "عمل فني من بكرات الأفلام" },
    why: { en: "The little orange cone that plays almost anything, made by a non-profit and downloaded billions of times.",
      ar: "المخروط البرتقالي الصغير الذي يشغّل كل شيء تقريبًا، صنعته جهة غير ربحية ونُزّل مليارات المرات." },
  },
  git: {
    motif: "branches",
    installation: { en: "Growing branches that merge into shared work", ar: "أغصان تنمو ثم تلتقي في عمل مشترك" },
    why: { en: "Almost every piece of modern software is written with it. It lets strangers across the world build one thing together.",
      ar: "تقريبًا كل برنامج حديث مكتوب بمساعدته. يسمح لغرباء حول العالم ببناء شيء واحد معًا." },
  },
  "apache-http-server": {
    motif: "pages",
    installation: { en: "A server delivering painted pages through the gallery", ar: "خادم يوزّع صفحات مرسومة عبر المعرض" },
    why: { en: "In the early web it served the majority of websites, and it still delivers pages to millions of people every day.",
      ar: "في بدايات الويب كان يقدّم أغلب المواقع، وما زال يوصل الصفحات لملايين الناس كل يوم." },
  },
  "code-oss": {
    motif: "editor",
    installation: { en: "An open editor sculpture, with its licence story told plainly", ar: "منحوتة محرر مفتوح، مع قصة ترخيصه ببساطة" },
    why: { en: "The world's most popular code editor is built on this open code, which is why free versions like VSCodium can exist.",
      ar: "أشهر محرر شيفرة في العالم مبني على هذه الشيفرة المفتوحة، ولهذا توجد نسخ حرة مثل VSCodium." },
  },
  "docker-engine": {
    motif: "containers",
    installation: { en: "Small containers assembling into a larger system", ar: "حاويات صغيرة تتجمع لتصنع نظامًا أكبر" },
    why: { en: "It ended the classic \"but it works on my computer\" problem, and much of the cloud runs on the idea.",
      ar: "أنهى مشكلة \"لكنه يعمل على جهازي\" الشهيرة، وجزء كبير من السحابة يعمل بهذه الفكرة." },
  },
  nextcloud: {
    motif: "cloud",
    installation: { en: "A private cloud of connected personal files", ar: "سحابة خاصة من ملفات شخصية مترابطة" },
    why: { en: "Files, calendars and video calls that schools, cities and families can run themselves.",
      ar: "ملفات وتقويمات ومكالمات فيديو تستطيع المدارس والمدن والعائلات تشغيلها بنفسها." },
  },
  proton: {
    motif: "bridge",
    installation: { en: "A bridge carrying a Windows game into Linux", ar: "جسر يحمل لعبة ويندوز إلى لينكس" },
    why: { en: "Thousands of games built only for Windows now play on Linux and the Steam Deck.",
      ar: "آلاف الألعاب المصنوعة لويندوز فقط أصبحت تعمل على لينكس وجهاز Steam Deck." },
  },
  retroarch: {
    motif: "cabinet",
    installation: { en: "A classic game interface presented as a retro museum cabinet", ar: "واجهة ألعاب كلاسيكية في خزانة متحف قديمة" },
    why: { en: "It helps preserve gaming history, so classic games keep running long after their consoles are gone.",
      ar: "يساعد في حفظ تاريخ الألعاب، فتبقى الألعاب الكلاسيكية تعمل بعد اختفاء أجهزتها بزمن طويل." },
  },
  searxng: {
    motif: "search",
    installation: { en: "Many search sources combining into a private search window", ar: "مصادر بحث كثيرة تجتمع في نافذة بحث خاصة" },
    why: { en: "You get results from many search engines at once, without any of them building a profile of you.",
      ar: "تحصل على نتائج من محركات بحث كثيرة في وقت واحد، دون أن يبني أي منها ملفًا عنك." },
  },
  kodi: {
    motif: "screen",
    installation: { en: "A cozy cinematic media-center room", ar: "غرفة سينما منزلية دافئة" },
    why: { en: "It turns an old computer into a living-room cinema, shaped by more than twenty years of volunteers.",
      ar: "يحوّل حاسوبًا قديمًا إلى سينما في غرفة المعيشة، صنعها متطوعون على مدى أكثر من عشرين سنة." },
  },
  jellyfin: {
    motif: "film",
    installation: { en: "A curated personal film collection", ar: "مجموعة أفلام شخصية منتقاة" },
    why: { en: "Your own movie and music collection, streamed to every screen at home, with no subscription.",
      ar: "مكتبة أفلامك وموسيقاك تُبث لكل شاشة في البيت، بدون أي اشتراك." },
  },
  "pi-hole": {
    motif: "filter",
    installation: { en: "Quiet protection filtering distracting network signals", ar: "حماية هادئة تصفّي الإشارات المزعجة" },
    why: { en: "One small device can quiet ads and trackers for every phone, TV and laptop in the house.",
      ar: "جهاز صغير واحد يمكنه إسكات الإعلانات والمتتبعات لكل هاتف وتلفاز وحاسوب في البيت." },
  },
  "risc-v": {
    motif: "chip",
    installation: { en: "An open instruction set embodied as a modular processor sculpture", ar: "لغة تعليمات مفتوحة على شكل منحوتة معالج" },
    why: { en: "Anyone can design a processor with it without asking permission or paying licence fees.",
      ar: "يستطيع أي أحد تصميم معالج به دون طلب إذن أو دفع رسوم ترخيص." },
  },
  "helium-browser": {
    motif: "window",
    installation: { en: "A minimal, calm browser installation", ar: "متصفح بسيط وهادئ" },
    why: { en: "It shows that a modern browser can be fast and private without asking for your attention all the time.",
      ar: "يثبت أن المتصفح الحديث يمكن أن يكون سريعًا وخاصًا دون أن يطلب انتباهك طوال الوقت." },
  },
  "zen-browser": {
    motif: "window",
    installation: { en: "An airy, peaceful browser workspace", ar: "مساحة تصفح هادئة ومريحة" },
    why: { en: "A gentler way to browse, built by a community on top of Firefox.",
      ar: "طريقة ألطف للتصفح، بناها مجتمع فوق فايرفوكس." },
  },
  ghostty: {
    motif: "terminal",
    installation: { en: "A subtle native terminal on an elegant gallery console", ar: "طرفية أنيقة على منضدة المعرض" },
    why: { en: "The text window programmers live in, made fast and comfortable and shared openly.",
      ar: "النافذة النصية التي يعيش فيها المبرمجون، أصبحت سريعة ومريحة ومشتركة للجميع." },
  },
  "phi-browser": {
    motif: "window",
    installation: { en: "An AI-native browser, with its open and closed parts shown side by side", ar: "متصفح بالذكاء الاصطناعي، أجزاؤه المفتوحة والمغلقة معروضة جنبًا إلى جنب" },
    why: { en: "A good example of why it pays to check which parts of a product are really open.",
      ar: "مثال جيد على أهمية التحقق من الأجزاء المفتوحة فعلًا في أي منتج." },
  },
  chromium: {
    motif: "foundation",
    installation: { en: "The foundations shared by many web browsers", ar: "الأساسات المشتركة لكثير من المتصفحات" },
    why: { en: "Chrome, Edge, Brave, Opera and many others are all built on this shared open code.",
      ar: "كروم وإيدج وبريف وأوبرا وغيرها كلها مبنية على هذه الشيفرة المفتوحة المشتركة." },
  },
  ffmpeg: {
    motif: "transform",
    installation: { en: "Raw video transforming into many beautiful formats", ar: "فيديو خام يتحول إلى صيغ جميلة كثيرة" },
    why: { en: "Hidden inside video sites, players and editors everywhere. Much of the world's video passes through it.",
      ar: "مخبأ داخل مواقع الفيديو والمشغلات والمحررات في كل مكان. جزء كبير من فيديو العالم يمر من خلاله." },
  },
  firefox: {
    motif: "flame",
    installation: { en: "An open browser exhibit revealing its code", ar: "متصفح مفتوح يكشف شيفرته" },
    why: { en: "Made by a non-profit, it keeps the web from belonging to a single company's browser engine.",
      ar: "تصنعه جهة غير ربحية، ويمنع الويب من أن يصبح ملكًا لمحرك متصفح شركة واحدة." },
  },
  godot: {
    motif: "diorama",
    installation: { en: "A tiny playable-looking game-world diorama", ar: "مجسم صغير لعالم لعبة" },
    why: { en: "A complete game engine with no royalties. Whatever you make is entirely yours.",
      ar: "محرك ألعاب كامل بدون أي نسبة أرباح. كل ما تصنعه ملكك بالكامل." },
  },
  postgresql: {
    motif: "tables",
    installation: { en: "An intricate system of organised data and relationships", ar: "نظام دقيق من البيانات المنظمة وعلاقاتها" },
    why: { en: "Banks, maps, games and startups trust it with their most important data, after more than thirty-five years of open work.",
      ar: "البنوك والخرائط والألعاب والشركات الناشئة تأتمنه على أهم بياناتها، بعد أكثر من خمس وثلاثين سنة من العمل المفتوح." },
  },
  arduino: {
    motif: "circuit",
    installation: { en: "An oversized open circuit board with illuminated paths and responsive lights", ar: "لوحة دوائر مفتوحة ضخمة بمسارات مضيئة وأضواء تستجيب" },
    why: { en: "Students, artists and inventors use it to build robots, instruments and gadgets, and the board designs themselves are shared.",
      ar: "يستخدمه الطلاب والفنانون والمخترعون لصنع روبوتات وآلات وأدوات، وتصاميم اللوحات نفسها منشورة." },
  },
  "truenas-community-edition": {
    motif: "vault",
    installation: { en: "A warm private storage vault with drive arrays and a snapshot rewind", ar: "خزنة تخزين خاصة دافئة بصفوف أقراص وإمكانية الرجوع للخلف" },
    why: { en: "Snapshots let you rewind files to before a mistake or a ransomware attack, on hardware you own.",
      ar: "اللقطات تسمح لك بإرجاع ملفاتك لما قبل خطأ أو هجوم فدية، على جهاز تملكه." },
  },
};
