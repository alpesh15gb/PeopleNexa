export type Lang = "en" | "hi";

export const LANG_COOKIE = "lang";

export const languages: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

const dict: Record<string, Record<Lang, string>> = {
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

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = dict[key]?.[lang] ?? dict[key]?.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
