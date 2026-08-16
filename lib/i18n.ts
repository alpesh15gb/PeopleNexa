export type Lang = "en" | "hi" | "gu" | "mr" | "ta";

export const LANG_COOKIE = "lang";

export const LANG_CODES: Lang[] = ["en", "hi", "gu", "mr", "ta"];

export function isLang(v: string): v is Lang {
  return (LANG_CODES as string[]).includes(v);
}

export const languages: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
];

const dict: Record<string, Partial<Record<Lang, string>>> = {
  // ---- shared ----
  "common.present": { en: "Present", hi: "उपस्थित" },
  "common.late": { en: "Late", hi: "विलंब" },
  "common.onLeave": { en: "On leave", hi: "अवकाश पर" },
  "common.absent": { en: "Absent", hi: "अनुपस्थित" },
  "common.noLeaveRequests": { en: "No leave requests yet.", hi: "अभी तक कोई अवकाश अनुरोध नहीं।" },
  "common.cancel": { en: "Cancel", hi: "रद्द करें" },
  "common.general": { en: "General", hi: "सामान्य" },
  "common.noShift": { en: "No shift", hi: "कोई शिफ्ट नहीं" },

  // ---- status pills ----
  "status.present": { en: "Present", hi: "उपस्थित" },
  "status.late": { en: "Late", hi: "विलंब" },
  "status.permission": { en: "Permission", hi: "अनुमति" },
  "status.absent": { en: "Absent", hi: "अनुपस्थित" },
  "status.half_day": { en: "Half day", hi: "आधा दिन" },
  "status.pending": { en: "Pending", hi: "लंबित" },
  "status.approved": { en: "Approved", hi: "स्वीकृत" },
  "status.rejected": { en: "Rejected", hi: "अस्वीकृत" },
  "status.active": { en: "Active", hi: "सक्रिय" },
  "status.inactive": { en: "Inactive", hi: "निष्क्रिय" },
  "status.paid": { en: "Paid", hi: "भुगतान" },
  "status.draft": { en: "Draft", hi: "ड्राफ्ट" },
  "status.available": { en: "Available", hi: "उपलब्ध" },
  "status.assigned": { en: "Assigned", hi: "आवंटित" },
  "status.maintenance": { en: "Maintenance", hi: "रखरखाव" },
  "status.retired": { en: "Retired", hi: "सेवानिवृत्त" },
  "status.lost": { en: "Lost", hi: "खोया" },

  // ---- navigation (employee) ----
  "nav.myDashboard": { en: "My Dashboard", hi: "मेरा डैशबोर्ड" },
  "nav.attendance": { en: "Attendance", hi: "उपस्थिति" },
  "nav.leaves": { en: "Leaves", hi: "अवकाश" },
  "nav.payslips": { en: "Payslips", hi: "पेस्लिप" },
  "nav.myProfile": { en: "My profile", hi: "मेरी प्रोफ़ाइल" },
  "nav.signOut": { en: "Sign out", hi: "साइन आउट" },
  "nav.employeePortal": { en: "Employee Portal", hi: "कर्मचारी पोर्टल" },

  // ---- employee dashboard ----
  "dashboard.welcome": { en: "Welcome back, {name} 👋", hi: "वापसी पर स्वागत है, {name} 👋" },
  "dashboard.recentLeaves": { en: "My recent leave requests", hi: "मेरे हाल के अवकाश अनुरोध" },
  "dashboard.latestActivity": { en: "Latest activity", hi: "नवीनतम गतिविधि" },
  "dashboard.thisMonth": { en: "This month", hi: "इस महीने" },
  "dashboard.days": { en: "{n} days", hi: "{n} दिन" },

  // ---- attendance ----
  "attendance.title": { en: "My attendance", hi: "मेरी उपस्थिति" },
  "attendance.noRecords": { en: "No attendance yet", hi: "अभी तक कोई उपस्थिति नहीं" },
  "attendance.noRecordsDesc": { en: "Your punches will appear here after you clock in.", hi: "क्लॉक इन करने के बाद आपके पंच यहाँ दिखेंगे।" },
  "attendance.date": { en: "Date", hi: "दिनांक" },
  "attendance.in": { en: "In", hi: "इन" },
  "attendance.out": { en: "Out", hi: "आउट" },
  "attendance.branchShift": { en: "Branch / Shift", hi: "ब्रांच / शिफ्ट" },
  "attendance.status": { en: "Status", hi: "स्थिति" },
  "attendance.holiday": { en: "Holiday: {name}", hi: "अवकाश: {name}" },
  "attendance.sunday": { en: "Sunday", hi: "रविवार" },
  "attendance.onLeave": { en: "On leave", hi: "अवकाश पर" },
  "attendance.onLeaveTitle": { en: "On leave ({type})", hi: "अवकाश पर ({type})" },
  "attendance.legendHoliday": { en: "Holiday", hi: "अवकाश" },

  // ---- leaves ----
  "leaves.title": { en: "My leaves", hi: "मेरे अवकाश" },
  "leaves.desc": { en: "Check your balance and request time off", hi: "अपना बैलेंस देखें और अवकाश माँगें" },
  "leaves.daysLeft": { en: "/ {max} days left", hi: "/ {max} दिन शेष" },
  "leaves.used": { en: "{used} used", hi: "{used} उपयोग किए" },
  "leaves.apply": { en: "Apply for leave", hi: "अवकाश के लिए आवेदन करें" },
  "leaves.myRequests": { en: "My requests", hi: "मेरे अनुरोध" },
  "leaves.allApplications": { en: "All your leave applications", hi: "आपके सभी अवकाश आवेदन" },
  "leaves.leaveType": { en: "Leave type", hi: "अवकाश प्रकार" },
  "leaves.from": { en: "From", hi: "से" },
  "leaves.to": { en: "To", hi: "तक" },
  "leaves.reason": { en: "Reason", hi: "कारण" },
  "leaves.reasonPlaceholder": { en: "Optional — tell your admin why", hi: "वैकल्पिक — अपने एडमिन को कारण बताएँ" },
  "leaves.submit": { en: "Submit request", hi: "अनुरोध जमा करें" },
  "leaves.left": { en: "{n} left", hi: "{n} शेष" },
  "leaves.submitted": { en: "Leave request submitted", hi: "अवकाश अनुरोध जमा किया गया" },
  "leaves.autoApproved": { en: "Leave approved automatically", hi: "अवकाश स्वतः स्वीकृत" },
  "leaves.day": { en: "{n} day", hi: "{n} दिन" },
  "leaves.days": { en: "{n} days", hi: "{n} दिन" },

  // ---- punch corrections (employee) ----
  "corrections.title": { en: "Punch corrections", hi: "पंच सुधार" },
  "corrections.request": { en: "Request correction", hi: "सुधार का अनुरोध करें" },
  "corrections.pending": { en: "pending", hi: "लंबित" },
  "corrections.none": { en: "No corrections yet", hi: "अभी तक कोई सुधार नहीं" },
  "corrections.noneDesc": { en: "Missed or wrong a punch? Request a correction here — your admin will review it.", hi: "पंच मिस या गलत हुआ? यहाँ सुधार का अनुरोध करें — आपका एडमिन इसकी समीक्षा करेगा।" },
  "corrections.requested": { en: "Requested", hi: "अनुरोधित" },
  "corrections.date": { en: "Date", hi: "दिनांक" },
  "corrections.inTime": { en: "Corrected in time", hi: "सही इन समय" },
  "corrections.outTime": { en: "Corrected out time", hi: "सही आउट समय" },
  "corrections.reason": { en: "Reason", hi: "कारण" },
  "corrections.reasonPlaceholder": { en: "Why was the punch missed or wrong?", hi: "पंच मिस या गलत क्यों हुआ?" },
  "corrections.submit": { en: "Submit request", hi: "अनुरोध जमा करें" },
  "corrections.submitted": { en: "Correction request submitted.", hi: "सुधार अनुरोध जमा किया गया।" },

  // ---- expenses (employee) ----
  "nav.expenses": { en: "Expenses", hi: "खर्च" },
  "nav.documents": { en: "Documents", hi: "दस्तावेज़" },
  "nav.performance": { en: "Performance", hi: "प्रदर्शन" },
  "nav.helpdesk": { en: "Helpdesk", hi: "सहायता डेस्क" },
  "nav.feed": { en: "Org Feed", hi: "ऑर्ग फ़ीड" },
  "nav.policies": { en: "Policies", hi: "नीतियां" },
  "nav.onboarding": { en: "Onboarding", hi: "ऑनबोर्डिंग" },
  "nav.exits": { en: "Exit", hi: "एग्ज़िट" },
  "nav.taxDeclarations": { en: "Tax Declaration", hi: "टैक्स घोषणा", gu: "ટેક્સ જાહેરાત", mr: "कर घोषणा", ta: "வரி அறிவிப்பு" },
  "documents.title": { en: "My Documents", hi: "मेरे दस्तावेज़" },
  "documents.description": { en: "Your documents on file — keep an eye on expiry dates.", hi: "आपके दर्ज दस्तावेज़ — समाप्ति तिथियों पर नज़र रखें।" },
  "documents.empty": { en: "No documents yet", hi: "अभी कोई दस्तावेज़ नहीं" },
  "documents.emptyDesc": { en: "Your employer can add documents like passport, visa or Aadhaar here.", hi: "आपका नियोक्ता यहां पासपोर्ट, वीज़ा या आधार जैसे दस्तावेज़ जोड़ सकता है।" },
  "policies.title": { en: "Company Policies", hi: "कंपनी नीतियां" },
  "policies.description": { en: "The official policies that apply to everyone.", hi: "आधिकारिक नीतियां जो सभी पर लागू होती हैं।" },
  "policies.empty": { en: "No policies published yet", hi: "अभी कोई नीति प्रकाशित नहीं" },
  "policies.emptyDesc": { en: "Company policies will appear here once published.", hi: "प्रकाशित होने पर कंपनी नीतियां यहां दिखेंगी।" },
  "expenses.title": { en: "My expenses", hi: "मेरे खर्च" },
  "expenses.desc": { en: "Submit expense and reimbursement claims", hi: "खर्च और प्रतिपूर्ति दावे जमा करें" },
  "expenses.settledTotal": { en: "settled total", hi: "निपटाया गया कुल" },
  "expenses.claims": { en: "claims", hi: "दावे" },
  "expenses.newClaim": { en: "New claim", hi: "नया दावा" },
  "expenses.none": { en: "No claims yet", hi: "अभी तक कोई दावा नहीं" },
  "expenses.noneDesc": { en: "Submit your first expense claim and it will appear here.", hi: "अपना पहला खर्च दावा जमा करें, यह यहाँ दिखेगा।" },
  "expenses.titleField": { en: "Title", hi: "शीर्षक" },
  "expenses.titlePlaceholder": { en: "e.g. Client visit — cab fare", hi: "जैसे ग्राहक मुलाकात — कैब किराया" },
  "expenses.category": { en: "Category", hi: "श्रेणी" },
  "expenses.amount": { en: "Amount (₹)", hi: "राशि (₹)" },
  "expenses.description": { en: "Description", hi: "विवरण" },
  "expenses.descPlaceholder": { en: "Optional details", hi: "वैकल्पिक विवरण" },
  "expenses.attachReceipt": { en: "Attach receipt photo", hi: "रसीद फ़ोटो जोड़ें" },
  "expenses.receiptTooLarge": { en: "Receipt image is too large (max 2MB).", hi: "रसीद इमेज बहुत बड़ी है (अधिकतम 2MB)।" },
  "expenses.submit": { en: "Submit claim", hi: "दावा जमा करें" },
  "expenses.submitted": { en: "Expense claim submitted.", hi: "खर्च दावा जमा किया गया।" },
  "expenses.cat.travel": { en: "Travel", hi: "यात्रा" },
  "expenses.cat.food": { en: "Food", hi: "भोजन" },
  "expenses.cat.fuel": { en: "Fuel", hi: "ईंधन" },
  "expenses.cat.mobile": { en: "Mobile", hi: "मोबाइल" },
  "expenses.cat.medical": { en: "Medical", hi: "चिकित्सा" },
  "expenses.cat.other": { en: "Other", hi: "अन्य" },

  // ---- payslips ----
  "payslips.title": { en: "My payslips", hi: "मेरी पेस्लिप" },
  "payslips.desc": { en: "Download and review your monthly salary", hi: "अपना मासिक वेतन देखें" },
  "payslips.none": { en: "No payslips yet", hi: "अभी तक कोई पेस्लिप नहीं" },
  "payslips.noneDesc": { en: "Your monthly payslips will appear here once payroll is run.", hi: "पेरोल चलने के बाद आपकी मासिक पेस्लिप यहाँ दिखेंगी।" },
  "payslips.month": { en: "Month", hi: "महीना" },
  "payslips.base": { en: "Base", hi: "मूल वेतन" },
  "payslips.netPay": { en: "Net pay", hi: "शुद्ध वेतन" },
  "payslips.status": { en: "Status", hi: "स्थिति" },
  "payslips.view": { en: "View", hi: "देखें" },
  "payslips.statement": { en: "Monthly salary statement", hi: "मासिक वेतन विवरण" },
  "payslips.basic": { en: "Basic salary", hi: "मूल वेतन" },
  "payslips.allowances": { en: "Allowances (12%)", hi: "भत्ते (12%)" },
  "payslips.deductions": { en: "Deductions (10%)", hi: "कटौतियाँ (10%)" },
  "payslips.disbursed": { en: "This salary has been disbursed. 💸", hi: "यह वेतन भुगतान किया जा चुका है। 💸" },
  "payslips.draft": { en: "Draft — awaiting disbursal.", hi: "ड्राफ्ट — भुगतान की प्रतीक्षा में।" },

  // ---- profile ----
  "profile.title": { en: "My profile", hi: "मेरी प्रोफ़ाइल" },
  "profile.employeeId": { en: "Employee ID", hi: "कर्मचारी आईडी" },
  "profile.email": { en: "Email", hi: "ईमेल" },
  "profile.phone": { en: "Phone", hi: "फ़ोन" },
  "profile.position": { en: "Position", hi: "पद" },
  "profile.department": { en: "Department", hi: "विभाग" },
  "profile.branch": { en: "Branch", hi: "ब्रांच" },
  "profile.shift": { en: "Shift", hi: "शिफ्ट" },
  "profile.joiningDate": { en: "Joining date", hi: "जॉइनिंग दिनांक" },
  "profile.lastLogin": { en: "Last login", hi: "अंतिम लॉगिन" },
  "profile.company": { en: "Company", hi: "कंपनी" },
  "profile.unassigned": { en: "Unassigned", hi: "असाइन नहीं" },
  "profile.teamMember": { en: "Team member", hi: "टीम सदस्य" },
  "profile.administrator": { en: "Administrator", hi: "प्रशासक" },
  "profile.employee": { en: "Employee", hi: "कर्मचारी" },
  "profile.myAssets": { en: "My assets", hi: "मेरी संपत्तियाँ" },
  "profile.assetsDesc": { en: "Company assets currently issued to you", hi: "आपको जारी की गई कंपनी की संपत्तियाँ" },
  "profile.noAssets": { en: "No assets assigned to you.", hi: "आपको कोई संपत्ति आवंटित नहीं है।" },
  "profile.assigned": { en: "assigned", hi: "आवंटित" },

  // ---- clock card ----
  "clock.dayComplete": { en: "Day complete", hi: "दिन पूरा" },
  "clock.clockedIn": { en: "Clocked in", hi: "क्लॉक इन" },
  "clock.notClockedIn": { en: "Not clocked in", hi: "क्लॉक इन नहीं" },
  "clock.in": { en: "In", hi: "इन" },
  "clock.out": { en: "Out", hi: "आउट" },
  "clock.clockIn": { en: "Clock in", hi: "क्लॉक इन" },
  "clock.clockOut": { en: "Clock out", hi: "क्लॉक आउट" },
  "clock.gettingLocation": { en: "Getting location…", hi: "लोकेशन मिल रही है…" },
  "clock.punchingIn": { en: "Punching in…", hi: "पंच इन हो रहा है…" },
  "clock.punchingOut": { en: "Punching out…", hi: "पंच आउट हो रहा है…" },
  "clock.addSelfie": { en: "Add selfie", hi: "सेल्फ़ी जोड़ें" },
  "clock.retakeSelfie": { en: "Retake selfie", hi: "सेल्फ़ी फिर से लें" },
  "clock.allSet": { en: "You're all set for today.", hi: "आज के लिए आप तैयार हैं।" },
  "clock.captureSelfie": { en: "Capture a selfie", hi: "सेल्फ़ी लें" },
  "clock.captureDesc": { en: "A photo is attached to this punch as proof of presence.", hi: "उपस्थिति के प्रमाण के रूप में इस पंच के साथ एक फ़ोटो जुड़ी है।" },
  "clock.capture": { en: "Capture", hi: "कैप्चर करें" },
  "clock.attached": { en: "attached", hi: "जुड़ी" },
  "clock.clockedInMsg": { en: "Clocked in — have a great day!", hi: "क्लॉक इन — आपका दिन शुभ हो!" },
  "clock.clockedOutMsg": { en: "Clocked out — see you tomorrow!", hi: "क्लॉक आउट — कल मिलते हैं!" },
  "clock.geoRequired": { en: "Geolocation is required to punch in/out", hi: "पंच इन/आउट के लिए जियोलोकेशन आवश्यक है" },
  "clock.cameraUnavailable": { en: "Camera unavailable — you can clock in without a selfie", hi: "कैमरा उपलब्ध नहीं — आप बिना सेल्फ़ी के क्लॉक इन कर सकते हैं" },
  "clock.locError": { en: "Could not get your location. Check permissions and try again.", hi: "आपकी लोकेशन नहीं मिल सकी। अनुमतियाँ जाँचें और फिर कोशिश करें।" },
  "clock.geofenceNote": { en: "Your location is verified against the {name} geofence before punching.", hi: "पंच से पहले आपकी लोकेशन {name} जियोफेंस के विरुद्ध सत्यापित की जाती है।" },
  "clock.noGeofenceNote": { en: "No geofence configured for your branch — location is still recorded.", hi: "आपकी ब्रांच के लिए कोई जियोफेंस कॉन्फ़िगर नहीं — लोकेशन फिर भी दर्ज की जाती है।" },

  // ---- notifications ----
  "notifications.title": { en: "Notifications", hi: "सूचनाएँ" },
  "notifications.unread": { en: "{n} unread", hi: "{n} अपठित" },
  "notifications.allCaughtUp": { en: "You're all caught up", hi: "आप सब देख चुके हैं" },
  "notifications.none": { en: "No notifications yet", hi: "अभी तक कोई सूचना नहीं" },
  "notifications.noneDesc": { en: "Leave decisions and attendance alerts will show up here.", hi: "अवकाश निर्णय और उपस्थिति अलर्ट यहाँ दिखेंगे।" },
  "notifications.new": { en: "New", hi: "नई" },
  "notifications.markRead": { en: "Mark as read", hi: "पढ़ा हुआ चिह्नित करें" },
};

// Starter translations for the new regional languages. Keys without a value
// fall back to हिन्दी (Hindi) and then English, so the app is always usable.
const langExtra: Record<string, Partial<Record<Lang, string>>> = {
  // ---- shared ----
  "common.present": { gu: "હાજર", mr: "उपस्थित", ta: "வந்துள்ளார்" },
  "common.late": { gu: "મોડું", mr: "उशीरा", ta: "தாமதம்" },
  "common.onLeave": { gu: "રજા પર", mr: "रजेवर", ta: "விடுப்பில்" },
  "common.absent": { gu: "ગેરહાજર", mr: "अनुपस्थित", ta: "வராதவர்" },
  "common.cancel": { gu: "રદ કરો", mr: "रद्द करा", ta: "ரத்து" },
  "status.present": { gu: "હાજર", mr: "उपस्थित", ta: "வந்துள்ளார்" },
  "status.late": { gu: "મોડું", mr: "उशीरा", ta: "தாமதம்" },
  "status.permission": { gu: "પરવાનગી", mr: "परवानगी", ta: "அனுமதி" },
  "status.absent": { gu: "ગેરહાજર", mr: "अनुपस्थित", ta: "வராதவர்" },
  "status.half_day": { gu: "અડધો દિવસ", mr: "अर्धा दिवस", ta: "அரை நாள்" },
  "status.pending": { gu: "બાકી", mr: "प्रलंबित", ta: "நிலுவையில்" },
  "status.approved": { gu: "મંજૂર", mr: "मंजूर", ta: "அங்கீகரிக்கப்பட்டது" },
  "status.rejected": { gu: "નામંજૂર", mr: "नाकारले", ta: "நிராகரிக்கப்பட்டது" },
  "status.active": { gu: "સક્રિય", mr: "सक्रिय", ta: "செயலில்" },
  "status.inactive": { gu: "નિષ્ક્રિય", mr: "निष्क्रिय", ta: "செயலற்றது" },
  "status.paid": { gu: "ચૂકવાયેલ", mr: "भरले", ta: "செலுத்தப்பட்டது" },
  "status.draft": { gu: "ડ્રાફ્ટ", mr: "मसुदा", ta: "வரைவு" },
  "status.available": { gu: "ઉપલબ્ધ", mr: "उपलब्ध", ta: "கிடைக்கிறது" },
  "status.assigned": { gu: "સોંપાયેલ", mr: "नियुक्त", ta: "ஒதுக்கப்பட்டது" },
  "status.maintenance": { gu: "જાળવણી", mr: "देखभाल", ta: "பராமரிப்பு" },
  "status.retired": { gu: "નિવૃત્ત", mr: "निवृत्त", ta: "ஓய்வு" },
  "status.lost": { gu: "ખોવાયેલ", mr: "हरवले", ta: "இழந்தது" },

  // ---- navigation (employee) ----
  "nav.myDashboard": { gu: "મારું ડેશબોર્ડ", mr: "माझे डॅशबोर्ड", ta: "எனது டாஷ்போர்டு" },
  "nav.attendance": { gu: "હાજરી", mr: "उपस्थिती", ta: "வருகை" },
  "nav.leaves": { gu: "રજાઓ", mr: "रजा", ta: "விடுப்பு" },
  "nav.payslips": { gu: "પગારપત્રક", mr: "पगारपत्रक", ta: "சம்பள சீட்டு" },
  "nav.myProfile": { gu: "મારી પ્રોફાઇલ", mr: "माझी प्रोफाइल", ta: "எனது சுயவிவரம்" },
  "nav.signOut": { gu: "સાઇન આઉટ", mr: "साइन आउट", ta: "வெளியேறு" },
  "nav.expenses": { gu: "ખર્ચ", mr: "खर्च", ta: "செலவுகள்" },
  "nav.documents": { gu: "દસ્તાવેજો", mr: "कागदपत्रे", ta: "ஆவணங்கள்" },
  "nav.performance": { gu: "કામગીરી", mr: "कामगिरी", ta: "செயல்திறன்" },
  "nav.helpdesk": { gu: "હેલ્પડેસ્ક", mr: "हेल्पडेस्क", ta: "உதவி மையம்" },
  "nav.feed": { gu: "ઓર્ગ ફીડ", mr: "ऑर्ग फीड", ta: "நிறுவன ஊட்டம்" },
  "nav.policies": { gu: "નીતિઓ", mr: "धोरणे", ta: "கொள்கைகள்" },

  // ---- dashboard ----
  "dashboard.welcome": { gu: "પાછા સ્વાગત છે, {name} 👋", mr: "पुन्हा स्वागत आहे, {name} 👋", ta: "மீண்டும் வரவேற்கிறோம், {name} 👋" },
  "dashboard.recentLeaves": { gu: "મારી તાજેતરની રજા અરજીઓ", mr: "माझ्या अलीकडील रजा अर्ज", ta: "எனது சமீபத்திய விடுப்பு கோரிக்கைகள்" },
  "dashboard.days": { gu: "{n} દિવસ", mr: "{n} दिवस", ta: "{n} நாட்கள்" },

  // ---- attendance ----
  "attendance.title": { gu: "મારી હાજરી", mr: "माझी उपस्थिती", ta: "எனது வருகை" },
  "attendance.date": { gu: "તારીખ", mr: "दिनांक", ta: "தேதி" },
  "attendance.in": { gu: "ઇન", mr: "इन", ta: "இன்" },
  "attendance.out": { gu: "આઉટ", mr: "आउट", ta: "அவுட்" },
  "attendance.status": { gu: "સ્થિતિ", mr: "स्थिती", ta: "நிலை" },
  "attendance.sunday": { gu: "રવિવાર", mr: "रविवार", ta: "ஞாயிறு" },
  "attendance.onLeave": { gu: "રજા પર", mr: "रजेवर", ta: "விடுப்பில்" },

  // ---- leaves ----
  "leaves.title": { gu: "મારી રજાઓ", mr: "माझी रजा", ta: "எனது விடுப்புகள்" },
  "leaves.apply": { gu: "રજા માટે અરજી કરો", mr: "रजेसाठी अर्ज करा", ta: "விடுப்பு விண்ணப்பிக்க" },
  "leaves.leaveType": { gu: "રજાનો પ્રકાર", mr: "रजेचा प्रकार", ta: "விடுப்பு வகை" },
  "leaves.from": { gu: "થી", mr: "पासून", ta: "இருந்து" },
  "leaves.to": { gu: "સુધી", mr: "पर्यंत", ta: "வரை" },
  "leaves.reason": { gu: "કારણ", mr: "कारण", ta: "காரணம்" },
  "leaves.submit": { gu: "અરજી મોકલો", mr: "अर्ज पाठवा", ta: "கோரிக்கை சமர்ப்பி" },
  "leaves.day": { gu: "{n} દિવસ", mr: "{n} दिवस", ta: "{n} நாள்" },
  "leaves.days": { gu: "{n} દિવસો", mr: "{n} दिवस", ta: "{n} நாட்கள்" },

  // ---- clock ----
  "clock.dayComplete": { gu: "દિવસ પૂર્ણ", mr: "दिवस पूर्ण", ta: "நாள் முடிந்தது" },
  "clock.clockedIn": { gu: "ક્લોક ઇન", mr: "क्लॉक इन", ta: "கிளாக் இன்" },
  "clock.notClockedIn": { gu: "ક્લોક ઇન નથી", mr: "क्लॉक इन नाही", ta: "கிளாக் இன் இல்லை" },
  "clock.in": { gu: "ઇન", mr: "इन", ta: "இன்" },
  "clock.out": { gu: "આઉટ", mr: "आउट", ta: "அவுட்" },
  "clock.clockIn": { gu: "ક્લોક ઇન", mr: "क्लॉक इन", ta: "கிளாக் இன்" },
  "clock.clockOut": { gu: "ક્લોક આઉટ", mr: "क्लॉक आउट", ta: "கிளாக் அவுட்" },
  "clock.allSet": { gu: "આજ માટે તમે તૈયાર છો.", mr: "आजसाठी तुम्ही तयार आहात.", ta: "இன்றைக்கு நீங்கள் தயார்." },
  "clock.addSelfie": { gu: "સેલ્ફી ઉમેરો", mr: "सेल्फी जोडा", ta: "செல்பி சேர்" },
  "clock.retakeSelfie": { gu: "સેલ્ફી ફરી લો", mr: "सेल्फी पुन्हा घ्या", ta: "செல்பி மீண்டும் எடு" },
  "clock.captureSelfie": { gu: "સેલ્ફી લો", mr: "सेल्फी घ्या", ta: "செல்பி எடு" },
  "clock.capture": { gu: "કેપ્ચર", mr: "कॅप्चर", ta: "பிடி" },
  "clock.clockedInMsg": { gu: "ક્લોક ઇન — તમારો દિવસ શુભ રહે!", mr: "क्लॉक इन — तुमचा दिवस चांगला जावो!", ta: "கிளாக் இன் — நாள் இனிதாக அமையட்டும்!" },
  "clock.clockedOutMsg": { gu: "ક્લોક આઉટ — આવતીકાલે મળીએ!", mr: "क्लॉक आउट — उद्या भेटू!", ta: "கிளாக் அவுட் — நாளை சந்திப்போம்!" },
  "clock.geoRequired": { gu: "પંચ કરવા માટે લોકેશન જરૂરી છે", mr: "पंच करण्यासाठी लोकेशन आवश्यक आहे", ta: "பஞ்ச் செய்ய இருப்பிடம் தேவை" },

  // ---- notifications ----
  "notifications.title": { gu: "સૂચનાઓ", mr: "सूचना", ta: "அறிவிப்புகள்" },
  "notifications.unread": { gu: "{n} વાંચેલી નથી", mr: "{n} न वाचलेल्या", ta: "{n} படிக்காதவை" },
};

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = dict[key] ?? {};
  const extra = langExtra[key] ?? {};
  let s = entry[lang] ?? extra[lang] ?? entry.hi ?? entry.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
