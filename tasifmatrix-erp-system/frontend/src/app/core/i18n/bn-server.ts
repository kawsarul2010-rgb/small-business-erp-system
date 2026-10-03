import { t } from './i18n';

/**
 * Bangla for server messages that carry names or numbers (exact sentences live in the
 * dictionary). Each entry: the English message as a pattern, and the Bangla built from
 * its captured parts. Labels and enum words inside are translated with t().
 */

/** "FINAL" / "MOBILE_BANKING" -> its translated label. */
function enumWord(value: string): string {
  return t(value.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
}

/** "Lux Soap (SOAP-01): available 8, requested 13; ..." -> the same in Bangla. */
function shortages(text: string): string {
  return text
    .replace(/: available ([^,;]+), (?:requested|needed) ([^;]+)/g, ': আছে $1, দরকার $2');
}

export const BN_SERVER_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(.+) is required\.$/, (m) => `${t(m[1])} আবশ্যক।`],
  [/^(.+) must be at most (\d+) characters\.$/, (m) => `${t(m[1])} সর্বোচ্চ ${m[2]} অক্ষরের হতে পারে।`],
  [/^(.+) was not found\.$/, (m) => `${t(m[1])} পাওয়া যায়নি।`],
  [/^Company code '(.+)' is already used\.$/, (m) => `কোম্পানি কোড '${m[1]}' আগে থেকেই ব্যবহৃত হচ্ছে।`],
  [/^Product code '(.+)' is already used\.$/, (m) => `পণ্যের কোড '${m[1]}' আগে থেকেই ব্যবহৃত হচ্ছে।`],
  [/^Not enough stock\. (.+)$/s, (m) => `পর্যাপ্ত স্টক নেই। ${shortages(m[1])}`],
  [/^(Not enough stock to finalize\.|This adjustment would make stock negative\.|Cannot void: the purchased stock has already been used\.) (.+)$/s,
    (m) => `${t(m[1])} ${shortages(m[2])}`],
  [/^Only DRAFT orders can be changed\. This order is (\w+)\.$/, (m) => `শুধু খসড়া অর্ডার পরিবর্তন করা যায়। এই অর্ডারটি ${enumWord(m[1])}।`],
  [/^An order cannot be changed from (\w+) to (\w+)\.$/, (m) => `অর্ডারকে ${enumWord(m[1])} থেকে ${enumWord(m[2])} করা যায় না।`],
  [/^Payment exceeds the due amount\. Due is (.+)\.$/, (m) => `পেমেন্ট বাকির চেয়ে বেশি। বাকি ${m[1]}।`],
  [/^Per (\w+) price cannot be negative\.$/, (m) => `প্রতি ${t(m[1])} মূল্য ঋণাত্মক হতে পারে না।`],
  [/^Product (.+) has no box size, so BOX cannot be used\.$/, (m) => `পণ্য ${m[1]}-এর বক্সের মাপ নেই, তাই বক্স ব্যবহার করা যাবে না।`],
  [/^Product (.+) is stocked in (\w+), so (\w+) cannot be used\.$/, (m) => `পণ্য ${m[1]}-এর স্টক ${enumWord(m[2])} এককে, তাই ${enumWord(m[3])} ব্যবহার করা যাবে না।`],
  [/^These products are deleted: (.+)\. Remove them from the order\.$/, (m) => `এই পণ্যগুলো মুছে ফেলা হয়েছে: ${m[1]}। অর্ডার থেকে এগুলো সরান।`],
  [/^This business account is suspended\. Please contact (.+) support\.$/, (m) => `এই ব্যবসার অ্যাকাউন্ট স্থগিত আছে। ${m[1]} সাপোর্টে যোগাযোগ করুন।`],
  [/^This product still has (.+) pcs in stock\. Adjust stock to 0 before deleting\.$/, (m) => `এই পণ্যের এখনও ${m[1]} পিস স্টকে আছে। মোছার আগে স্টক সমন্বয় করে ০ করুন।`],
  [/^Too many failed attempts\. Try again in (\d+) minute\(s\)\.$/, (m) => `অনেকবার ভুল চেষ্টা হয়েছে। ${m[1]} মিনিট পর আবার চেষ্টা করুন।`],
  [/^Business code must be (.+)$/, () => 'ব্যবসার কোড ৩ থেকে ৩০ অক্ষরের হতে হবে: ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন; শুরু বা শেষে হাইফেন নয়।'],
  [/^Invalid value for \w+\.$/, () => 'মান সঠিক নয়।'],
];
