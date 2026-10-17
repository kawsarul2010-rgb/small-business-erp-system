import type { GuideDesktop, GuideLang } from './guide-content';

/**
 * The user guide on a computer (the website on a desktop or laptop screen), by section id.
 *
 * Pictures live in public/guide/{lang}/desktop/{shot}.webp and are wide-screen captures with
 * numbered markers; as on the phone, marker 1 is step 1. A section without an entry here shows
 * its phone version. Intro and tips replace the phone's when given.
 */
export const DESKTOP: Record<GuideLang, Record<string, GuideDesktop>> = {
  // ===================================================================================
  // English
  // ===================================================================================
  en: {
    start: {
      intro: 'On a computer, open tasifmatrix.com.bd in any browser (Chrome, Edge, Firefox or Safari). It is the same account and the same data as the phone app.',
      parts: [
        {
          shot: 'register-choice', title: 'Create an account',
          steps: [
            'Register my business — choose this if you own the business. You become its admin and can add your staff later.',
            'Join a business — choose this if your business already uses the app. Ask your admin for the business code first.',
          ],
        },
        {
          shot: 'register-business', title: 'Register your business',
          steps: [
            'Your business name. The business code below it is filled in for you — your staff use it to join.',
            'Your business size.',
            'Your own details: full name, email and mobile number.',
            'A password (at least 8 characters with a letter and a number), then click Create business account. You are signed in straight away.',
          ],
        },
        {
          title: 'Join your business (staff)',
          steps: [
            'On the sign-up page click Join a business and enter the business code your admin gave you.',
            'Enter your full name, email, mobile number and a password, then click Create account.',
            'New members start with read-only access. Ask your admin to give you a role (see "Your team and roles").',
          ],
        },
        {
          shot: 'login', title: 'Log in',
          steps: [
            'Your email address.',
            'Your password. Click the eye to see what you typed.',
            'Click Log in.',
            'Forgot your password? Click here and we email you a link to set a new one.',
            'No account yet? Click Create an account.',
          ],
        },
      ],
      tips: [
        'English or বাংলা: use the switch at the top right of the log-in page, or later the language button at the top of every page.',
        'Bookmark the page (Ctrl+D, or ⌘+D on a Mac) to open it quickly next time.',
      ],
    },
    home: {
      parts: [
        {
          shot: 'dashboard',
          steps: [
            'The menu on the left: every screen, grouped — sales and purchases, stock, customers and suppliers, reports, and settings. Click ☰ at the top to make it narrow.',
            'New sale and New purchase — start an order straight away.',
            'Your business at a glance: today\'s sales, this month\'s sales and purchases, what customers owe you and what you owe suppliers. Click a tile to open the list behind it.',
            'বাংলা / English — switch the language of the whole app. Next to it: light or dark mode.',
            'Your name — your profile, password, language and Log out.',
          ],
        },
        {
          shot: 'user-menu', title: 'Your menu (top right)',
          steps: [
            'My profile — your details and account.',
            'Language — English or বাংলা.',
            'Log out — always log out on a shared computer.',
          ],
        },
      ],
      tips: ['The page title at the top shows where you are. The menu item for the open page is highlighted.'],
    },
    company: {
      intro: 'Your company is created when you register, and every order belongs to it automatically. Its name, address and phone are printed on every invoice, receipt and report. Click Companies in the left menu, then the pencil next to your company.',
      parts: [
        {
          shot: 'company-form',
          steps: [
            'Company name, exactly as it should appear on invoices and receipts.',
            'A short company code, for example SE.',
            'Address, city and division.',
            'Phone number for your customers. Then click Save.',
          ],
        },
      ],
    },
    products: {
      intro: 'Click Products in the left menu, then New product at the top right.',
      parts: [
        {
          shot: 'product-form',
          steps: [
            'Product name and a code you recognise, for example SOAP-01.',
            'Unit: PCS (pieces), KG, LITRE or BOX. Stock is counted in this unit.',
            'For BOX: what one box holds — for example 12 pieces. Then you can sell by the box or by the piece.',
            'Purchase price per unit (per piece, kg or litre).',
            'Sales price per unit. Orders fill in both prices for you; you can still change them on each order.',
            'Low stock alert (optional): below this number the product is marked "Low stock". Then click Save.',
          ],
        },
      ],
    },
    parties: {
      intro: 'Click Customers (or Suppliers) in the left menu, then New customer at the top right. Each one gets a code like 100001 automatically.',
      parts: [
        {
          shot: 'customer-form',
          steps: [
            'Name of the customer or shop.',
            'Mobile number. Order and payment SMS go to this number.',
            'Address (optional, printed on invoices). City, division and postal code are optional too.',
            'SMS switch — on by default. Turn it off for a customer who should not get SMS. Then click Save.',
          ],
        },
      ],
      tips: ['Click a row in the list to open that customer\'s orders. The pencil on the right edits the details.'],
    },
    sales: {
      intro: 'Click New sale on the Dashboard, or Sales orders in the left menu and then New sales order. The order is saved as a DRAFT first; stock does not change until you finalize it.',
      parts: [
        {
          shot: 'sales-editor',
          steps: [
            'Customer — type part of the name, code or mobile number and pick from the list.',
            'Payment type: Cash, Due (pay later) or Installment.',
            'Order date — today by default. You can pick any date.',
            'Product — type part of the name and pick it. The box size and current stock appear under it.',
            'Type — sell by BOX, or by the piece, kg or litre.',
            'Quantity — here 5 boxes. The total quantity fills in.',
            'Unit price and line total fill in for you. Change the price to give a discount; the line total updates.',
            'Add line — for the next product. The order total is shown on the right.',
            'Save draft.',
          ],
        },
      ],
      tips: [
        'The Send SMS switch above the products decides whether the customer gets an SMS for this order.',
        'Something missing when you click Save draft? That box turns red, the cursor goes to it, and the message under the order says what to fill in.',
        'Press Tab to move from box to box without the mouse.',
      ],
    },
    purchase: {
      intro: 'Click New purchase on the Dashboard, or Purchase orders in the left menu and then New purchase order. When you finalize it, the stock goes up.',
      parts: [
        {
          shot: 'purchase-editor',
          steps: [
            'Supplier — type part of the name and pick from the list.',
            'Payment type: Cash, Due or Installment. The order date is next to it.',
            'Products, quantities and prices — exactly as in a sales order.',
            'Save draft.',
          ],
        },
      ],
    },
    finalize: {
      parts: [
        {
          shot: 'order-draft', title: 'A draft order',
          steps: [
            'Finalize — confirms the order. Stock goes out (sales) or comes in (purchase), and the order can no longer be edited.',
            'Edit — change the draft as often as you like before finalizing.',
            '⋮ — more actions, such as Delete draft.',
          ],
        },
        {
          shot: 'order-final', title: 'A finalized order',
          steps: [
            'Print — the invoice as a PDF, a POS receipt, or share it.',
            'Add payment — record money you received (or paid a supplier).',
            'SMS switch for this order.',
            'Order details: customer, payment type, total, paid and due. The products and every payment are listed below.',
            '⋮ — Void cancels a finalized order and returns its stock (remove its payments first).',
          ],
        },
        {
          shot: 'print-menu', title: 'Print',
          steps: [
            'Open PDF — the A4 invoice in a new tab, ready to print.',
            'Download PDF — save it to your computer.',
            'POS receipt — print on a small receipt (thermal) printer.',
            'Share — WhatsApp or email, with the PDF attached.',
          ],
        },
        {
          shot: 'pos-receipt', title: 'POS receipt',
          steps: [
            'Paper width of your receipt printer: 80 mm or 58 mm. It is remembered on this computer.',
            'Preview — the receipt exactly as it prints: your business, the items, total, paid and due.',
            'Print receipt. In the print window choose your receipt printer, set Margins to None and Scale to 100% (the browser remembers this).',
          ],
        },
        {
          shot: 'payment-dialog', title: 'Add a payment',
          steps: [
            'Amount received.',
            'Method: Cash, Bank, Mobile banking (bKash, Nagad), Cheque or Other.',
            'Payment date.',
            'Pay full due — fills in the whole remaining amount.',
            'Note, for example the bKash transaction ID. Then click Add payment.',
          ],
        },
      ],
      tips: [
        'Customers pay in parts? Add a payment each time; the due goes down and every payment is listed.',
        'The POS receipt works with any USB or network receipt printer installed on the computer, in English or Bangla.',
      ],
    },
    stock: {
      intro: 'Stock changes only when an order is finalized or voided, or when an admin posts an adjustment. Click Stock balance in the left menu.',
      parts: [
        {
          shot: 'stock-balance', title: 'Stock balance',
          steps: [
            'Search for a product.',
            'Low stock only — show just the products below their alert level.',
            'A red number means the stock is below the alert level — time to reorder.',
            'Adjust stock (admins) — for opening stock, damage, loss and corrections. Ledger shows every movement.',
          ],
        },
        {
          shot: 'stock-adjust', title: 'Stock adjustment',
          steps: [
            'Product — the current stock is shown below it.',
            'Increase or Decrease.',
            'Quantity.',
            'Reason: Opening stock, Damage, Loss, Correction or Other.',
            'Date of the adjustment.',
            'Note (optional). Then click Post adjustment.',
          ],
        },
      ],
    },
    reports: {
      intro: 'Reports (left menu) count finalized orders only. Every report can be printed or shared as a PDF.',
      parts: [
        {
          shot: 'due-report', title: 'Due report',
          steps: [
            'Customer dues (money owed to you) or Supplier dues (money you owe).',
            'Order date — show a date range.',
            'Print / share the report as a PDF.',
            'Each unpaid order with the days it has been due. Click it to open the order and add a payment.',
          ],
        },
        {
          shot: 'customer-report', title: 'Customer report',
          steps: [
            'Totals: number of orders, order total, paid and due.',
            'Search a customer, pick a date range or show only customers with a due.',
            'One line per customer. Its button on the right opens that customer\'s orders — print them from there.',
            'Print / share the whole report.',
          ],
        },
      ],
      tips: ['Supplier report and Company report work the same way. On the Sales orders list, choose a customer and click Print / share to print that customer\'s orders.'],
    },
    team: {
      parts: [
        {
          shot: 'invite', title: 'Invite your staff (left menu → Users)',
          steps: [
            'Your business code. Staff choose Create account → Join a business and enter it.',
            'Copy code, or Copy sign-up link to send it on WhatsApp or email.',
          ],
        },
        {
          shot: 'user-form', title: 'Give each person a role',
          steps: [
            'Role: Admin (everything), Manager (sales, customers and stock) or User (read-only).',
            'For a customer or supplier who logs in: link their User account to them, so they see only their own orders and dues.',
            'Click the pencil next to a person to open this. Set a new password here if someone forgot theirs — they must change it at the next log-in. Then click Save.',
          ],
        },
      ],
      tips: ['Locked after too many wrong passwords? Click the lock icon next to the person on the Users page.'],
    },
    sms: {
      intro: 'The app can text your customers and suppliers when an order is finalized and when a payment is added, with their total, paid and due. Click Settings in the left menu.',
      parts: [
        {
          shot: 'settings',
          steps: [
            'Send SMS to customers and suppliers — the main switch for your business.',
            'Turn SMS on for new orders — new orders start with SMS switched on.',
          ],
        },
        {
          shot: 'sms-log', title: 'SMS log (left menu)',
          steps: [
            'Your SMS balance: how many SMS are left and when they expire.',
            'Show all messages, or only Pending, Sent, Failed or Skipped ones.',
            'Every message with its text and status. A failed or skipped one has a Retry button.',
          ],
        },
      ],
      tips: [
        'An SMS goes out only when all three are on: the business switch, the customer\'s SMS switch and the order\'s Send SMS switch.',
        'Each message uses SMS from your balance — a long message uses 2 or more. With none left, messages are kept as Skipped; press Retry once you have SMS again.',
      ],
    },
    billing: {
      intro: 'Click Billing in the left menu to see your package, your SMS balance and your payments. New businesses start with a free trial.',
      parts: [
        {
          shot: 'billing',
          steps: [
            'SMS balance — how many SMS you have left and when they expire. Open "SMS packs" to see each purchase.',
            'Buy SMS — SMS only, at any time, for example when they run out in the middle of your package.',
            'Packages for your business size — monthly, 3 months and longer. Paying early never loses days: the time is added after your current end date.',
            'Pay with bKash. You can switch on "Add SMS to this payment" to buy SMS in the same payment.',
          ],
        },
        {
          shot: 'buy-sms', title: 'Buy SMS',
          steps: [
            'How many SMS: pick a number or type your own.',
            'The price: number × price per SMS.',
            'Pay with bKash. After paying you return to Billing and the SMS are added straight away.',
          ],
        },
      ],
      tips: ['Bought SMS last for a few months from the day you buy them. Older SMS are used first.'],
    },
    portal: {
      parts: [
        {
          shot: 'portal',
          steps: [
            'Your summary with this business: orders, total, paid and due.',
            'Your orders. Click one to see its products and payments, and to download the invoice.',
            'The menu on the left: your purchases, the due report and this guide.',
          ],
        },
      ],
    },
    account: {
      intro: 'Click your name at the top right, then My profile.',
      parts: [
        {
          shot: 'profile',
          steps: [
            'Change password.',
            'Delete account — erases your account. If you are the only admin, the whole business is closed and its records deleted. This cannot be undone.',
          ],
        },
      ],
    },
  },

  // ===================================================================================
  // বাংলা
  // ===================================================================================
  bn: {
    start: {
      intro: 'কম্পিউটারে যেকোনো ব্রাউজারে (Chrome, Edge, Firefox বা Safari) tasifmatrix.com.bd খুলুন। ফোন অ্যাপের মতোই একই অ্যাকাউন্ট, একই তথ্য।',
      parts: [
        {
          shot: 'register-choice', title: 'অ্যাকাউন্ট তৈরি করুন',
          steps: [
            'আমার ব্যবসা নিবন্ধন করুন — আপনি ব্যবসার মালিক হলে এটি বেছে নিন। আপনি অ্যাডমিন হবেন এবং পরে কর্মীদের যোগ করতে পারবেন।',
            'একটি ব্যবসায় যোগ দিন — আপনার ব্যবসা আগে থেকেই অ্যাপটি ব্যবহার করলে এটি বেছে নিন। আগে অ্যাডমিনের কাছ থেকে ব্যবসার কোড নিন।',
          ],
        },
        {
          shot: 'register-business', title: 'ব্যবসা নিবন্ধন',
          steps: [
            'আপনার ব্যবসার নাম। নিচের ব্যবসার কোড নিজে থেকে পূরণ হয় — কর্মীরা এটি দিয়ে যোগ দেবেন।',
            'আপনার ব্যবসার আকার।',
            'আপনার নিজের তথ্য: পুরো নাম, ইমেইল ও মোবাইল নম্বর।',
            'একটি পাসওয়ার্ড (কমপক্ষে 8 অক্ষর, অন্তত একটি অক্ষর ও একটি সংখ্যা), তারপর "ব্যবসার অ্যাকাউন্ট তৈরি করুন" ক্লিক করুন। সঙ্গে সঙ্গে লগ ইন হয়ে যাবেন।',
          ],
        },
        {
          title: 'আপনার ব্যবসায় যোগ দিন (কর্মী)',
          steps: [
            'নিবন্ধন পাতায় "একটি ব্যবসায় যোগ দিন" ক্লিক করে অ্যাডমিনের দেওয়া ব্যবসার কোড লিখুন।',
            'পুরো নাম, ইমেইল, মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে "অ্যাকাউন্ট তৈরি করুন" ক্লিক করুন।',
            'নতুন সদস্যরা শুধু দেখতে পারেন। অ্যাডমিনকে একটি ভূমিকা দিতে বলুন ("আপনার দল ও ভূমিকা" দেখুন)।',
          ],
        },
        {
          shot: 'login', title: 'লগ ইন',
          steps: [
            'আপনার ইমেইল ঠিকানা।',
            'আপনার পাসওয়ার্ড। কী লিখেছেন দেখতে চোখের চিহ্নে ক্লিক করুন।',
            '"লগ ইন" ক্লিক করুন।',
            'পাসওয়ার্ড ভুলে গেছেন? এখানে ক্লিক করুন — নতুন পাসওয়ার্ড দেওয়ার লিংক ইমেইলে পাঠানো হবে।',
            'এখনও অ্যাকাউন্ট নেই? "অ্যাকাউন্ট তৈরি করুন" ক্লিক করুন।',
          ],
        },
      ],
      tips: [
        'English বা বাংলা: লগ ইন পাতার উপরে ডান দিকের সুইচ, অথবা পরে প্রতিটি পাতার উপরের ভাষা বোতাম ব্যবহার করুন।',
        'পরে দ্রুত খুলতে পাতাটি বুকমার্ক করুন (Ctrl+D, Mac-এ ⌘+D)।',
      ],
    },
    home: {
      parts: [
        {
          shot: 'dashboard',
          steps: [
            'বাঁ পাশের মেনু: সব পাতা, ভাগ করে সাজানো — বিক্রয় ও ক্রয়, স্টক, গ্রাহক ও সরবরাহকারী, রিপোর্ট এবং সেটিংস। উপরের ☰ ক্লিক করলে মেনু সরু হয়।',
            'নতুন বিক্রয় ও নতুন ক্রয় — সঙ্গে সঙ্গে অর্ডার শুরু করুন।',
            'এক নজরে আপনার ব্যবসা: আজকের বিক্রয়, এই মাসের বিক্রয় ও ক্রয়, গ্রাহকদের কাছে পাওনা এবং সরবরাহকারীদের দেনা। কোনো টাইলে ক্লিক করলে তার তালিকা খোলে।',
            'বাংলা / English — পুরো অ্যাপের ভাষা বদলান। পাশেই লাইট বা ডার্ক মোড।',
            'আপনার নাম — প্রোফাইল, পাসওয়ার্ড, ভাষা ও লগ আউট।',
          ],
        },
        {
          shot: 'user-menu', title: 'আপনার মেনু (উপরে ডানে)',
          steps: [
            'আমার প্রোফাইল — আপনার তথ্য ও অ্যাকাউন্ট।',
            'ভাষা — English বা বাংলা।',
            'লগ আউট — অন্যের সঙ্গে ভাগ করা কম্পিউটারে সবসময় লগ আউট করুন।',
          ],
        },
      ],
      tips: ['উপরের পাতার নাম দেখে বোঝা যায় আপনি কোথায় আছেন। খোলা পাতার মেনুটি হাইলাইট থাকে।'],
    },
    company: {
      intro: 'নিবন্ধনের সময় আপনার কোম্পানি তৈরি হয়, এবং প্রতিটি অর্ডার নিজে থেকেই এর অধীনে যায়। এর নাম, ঠিকানা ও ফোন প্রতিটি ইনভয়েস, রসিদ ও রিপোর্টে ছাপা হয়। বাঁ পাশের মেনুতে "কোম্পানি" ক্লিক করে আপনার কোম্পানির পাশের পেন্সিলে ক্লিক করুন।',
      parts: [
        {
          shot: 'company-form',
          steps: [
            'কোম্পানির নাম, ইনভয়েস ও রসিদে যেভাবে দেখাবে ঠিক সেভাবে।',
            'ছোট একটি কোম্পানি কোড, যেমন SE।',
            'ঠিকানা, শহর ও বিভাগ।',
            'গ্রাহকদের জন্য ফোন নম্বর। তারপর "সংরক্ষণ করুন" ক্লিক করুন।',
          ],
        },
      ],
    },
    products: {
      intro: 'বাঁ পাশের মেনুতে "পণ্য" ক্লিক করে উপরে ডানে "নতুন পণ্য" ক্লিক করুন।',
      parts: [
        {
          shot: 'product-form',
          steps: [
            'পণ্যের নাম এবং চেনার মতো একটি কোড, যেমন SOAP-01।',
            'একক: পিস, কেজি, লিটার বা বক্স। স্টক এই এককে গোনা হয়।',
            'বক্সের জন্য: এক বক্সে কী থাকে — যেমন 12 পিস। তাহলে বক্স বা পিস দুইভাবেই বিক্রি করা যায়।',
            'প্রতি এককের ক্রয়মূল্য (প্রতি পিস, কেজি বা লিটার)।',
            'প্রতি এককের বিক্রয়মূল্য। অর্ডারে দুটো দামই নিজে থেকে বসে; প্রতিটি অর্ডারে বদলানো যায়।',
            'কম স্টকের সতর্কতা (ঐচ্ছিক): এর নিচে নামলে পণ্যটি "কম স্টক" দেখায়। তারপর "সংরক্ষণ করুন" ক্লিক করুন।',
          ],
        },
      ],
    },
    parties: {
      intro: 'বাঁ পাশের মেনুতে "গ্রাহক" (বা "সরবরাহকারী") ক্লিক করে উপরে ডানে "নতুন গ্রাহক" ক্লিক করুন। প্রত্যেকে নিজে থেকে 100001-এর মতো একটি কোড পায়।',
      parts: [
        {
          shot: 'customer-form',
          steps: [
            'গ্রাহক বা দোকানের নাম।',
            'মোবাইল নম্বর। অর্ডার ও পেমেন্টের SMS এই নম্বরে যায়।',
            'ঠিকানা (ঐচ্ছিক, ইনভয়েসে ছাপা হয়)। শহর, বিভাগ ও পোস্ট কোডও ঐচ্ছিক।',
            'SMS সুইচ — শুরুতে চালু। যে গ্রাহক SMS পাবেন না, তার জন্য বন্ধ করুন। তারপর "সংরক্ষণ করুন" ক্লিক করুন।',
          ],
        },
      ],
      tips: ['তালিকার কোনো সারিতে ক্লিক করলে ওই গ্রাহকের অর্ডারগুলো খোলে। ডানের পেন্সিলে ক্লিক করে তথ্য বদলান।'],
    },
    sales: {
      intro: 'ড্যাশবোর্ডে "নতুন বিক্রয়" ক্লিক করুন, অথবা বাঁ পাশের মেনুতে "বিক্রয় অর্ডার" ক্লিক করে "নতুন বিক্রয় অর্ডার"। অর্ডার প্রথমে খসড়া হিসেবে সংরক্ষিত হয়; চূড়ান্ত না করা পর্যন্ত স্টক বদলায় না।',
      parts: [
        {
          shot: 'sales-editor',
          steps: [
            'গ্রাহক — নাম, কোড বা মোবাইল নম্বরের কিছু অংশ লিখে তালিকা থেকে বেছে নিন।',
            'পেমেন্টের ধরন: নগদ, বাকি (পরে পরিশোধ) বা কিস্তি।',
            'অর্ডারের তারিখ — শুরুতে আজকের তারিখ। যেকোনো তারিখ বেছে নিতে পারেন।',
            'পণ্য — নামের কিছু অংশ লিখে বেছে নিন। নিচে বক্সের মাপ ও বর্তমান স্টক দেখায়।',
            'ধরন — বক্সে, অথবা পিস, কেজি বা লিটারে বিক্রি।',
            'পরিমাণ — এখানে 5 বক্স। মোট পরিমাণ নিজে থেকে বসে।',
            'একক দাম ও লাইনের মোট নিজে থেকে বসে। ছাড় দিতে দাম বদলান; লাইনের মোটও বদলে যায়।',
            'লাইন যোগ করুন — পরের পণ্যের জন্য। অর্ডারের মোট ডান দিকে দেখায়।',
            'খসড়া সংরক্ষণ।',
          ],
        },
      ],
      tips: [
        'পণ্যের উপরের "SMS পাঠান" সুইচ ঠিক করে এই অর্ডারের জন্য গ্রাহক SMS পাবেন কি না।',
        '"খসড়া সংরক্ষণ" ক্লিক করার সময় কিছু বাদ থাকলে সেই ঘরটি লাল হয়, কার্সর সেখানে চলে যায় এবং অর্ডারের নিচের বার্তায় কী পূরণ করতে হবে তা লেখা থাকে।',
        'মাউস ছাড়াই এক ঘর থেকে পরের ঘরে যেতে Tab চাপুন।',
      ],
    },
    purchase: {
      intro: 'ড্যাশবোর্ডে "নতুন ক্রয়" ক্লিক করুন, অথবা বাঁ পাশের মেনুতে "ক্রয় অর্ডার" ক্লিক করে "নতুন ক্রয় অর্ডার"। চূড়ান্ত করলে স্টক বাড়ে।',
      parts: [
        {
          shot: 'purchase-editor',
          steps: [
            'সরবরাহকারী — নামের কিছু অংশ লিখে তালিকা থেকে বেছে নিন।',
            'পেমেন্টের ধরন: নগদ, বাকি বা কিস্তি। পাশেই অর্ডারের তারিখ।',
            'পণ্য, পরিমাণ ও দাম — বিক্রয় অর্ডারের মতোই।',
            'খসড়া সংরক্ষণ।',
          ],
        },
      ],
    },
    finalize: {
      parts: [
        {
          shot: 'order-draft', title: 'খসড়া অর্ডার',
          steps: [
            'চূড়ান্ত করুন — অর্ডার নিশ্চিত করে। স্টক বের হয় (বিক্রয়) বা আসে (ক্রয়), এবং অর্ডারটি আর সম্পাদনা করা যায় না।',
            'সম্পাদনা — চূড়ান্ত করার আগে যতবার খুশি খসড়া বদলান।',
            '⋮ — আরও কাজ, যেমন খসড়া মুছুন।',
          ],
        },
        {
          shot: 'order-final', title: 'চূড়ান্ত অর্ডার',
          steps: [
            'প্রিন্ট — PDF হিসেবে ইনভয়েস, POS রসিদ, অথবা শেয়ার।',
            'পেমেন্ট যোগ করুন — পাওয়া টাকা (বা সরবরাহকারীকে দেওয়া টাকা) লিখুন।',
            'এই অর্ডারের SMS সুইচ।',
            'অর্ডারের তথ্য: গ্রাহক, পেমেন্টের ধরন, মোট, পরিশোধিত ও বাকি। নিচে পণ্য ও প্রতিটি পেমেন্টের তালিকা।',
            '⋮ — "অর্ডার বাতিল করুন" চূড়ান্ত অর্ডার বাতিল করে স্টক ফেরত দেয় (আগে পেমেন্টগুলো সরান)।',
          ],
        },
        {
          shot: 'print-menu', title: 'প্রিন্ট',
          steps: [
            'PDF খুলুন — নতুন ট্যাবে A4 ইনভয়েস, প্রিন্টের জন্য প্রস্তুত।',
            'PDF ডাউনলোড — কম্পিউটারে সংরক্ষণ করুন।',
            'POS রসিদ — ছোট রসিদ (থার্মাল) প্রিন্টারে প্রিন্ট।',
            'শেয়ার — PDF সংযুক্ত করে WhatsApp বা ইমেইলে।',
          ],
        },
        {
          shot: 'pos-receipt', title: 'POS রসিদ',
          steps: [
            'আপনার রসিদ প্রিন্টারের কাগজের মাপ: 80 mm বা 58 mm। এই কম্পিউটারে মনে রাখা হয়।',
            'প্রিভিউ — রসিদ ঠিক যেভাবে ছাপা হবে: আপনার ব্যবসা, পণ্য, মোট, পরিশোধিত ও বাকি।',
            '"রসিদ প্রিন্ট করুন"। প্রিন্ট উইন্ডোতে আপনার রসিদ প্রিন্টার বেছে নিন, Margins "None" ও Scale "100%" দিন (ব্রাউজার এটি মনে রাখে)।',
          ],
        },
        {
          shot: 'payment-dialog', title: 'পেমেন্ট যোগ করুন',
          steps: [
            'পাওয়া টাকার পরিমাণ।',
            'মাধ্যম: নগদ, ব্যাংক, মোবাইল ব্যাংকিং (বিকাশ, নগদ), চেক বা অন্যান্য।',
            'পেমেন্টের তারিখ।',
            'পুরো বাকি দিন — বাকি পুরো টাকা বসিয়ে দেয়।',
            'নোট, যেমন বিকাশের ট্রানজেকশন আইডি। তারপর "পেমেন্ট যোগ করুন" ক্লিক করুন।',
          ],
        },
      ],
      tips: [
        'গ্রাহক কিস্তিতে দেন? প্রতিবার একটি করে পেমেন্ট যোগ করুন; বাকি কমতে থাকে এবং সব পেমেন্টের তালিকা দেখা যায়।',
        'POS রসিদ কম্পিউটারে ইনস্টল করা যেকোনো USB বা নেটওয়ার্ক রসিদ প্রিন্টারে চলে, ইংরেজি বা বাংলায়।',
      ],
    },
    stock: {
      intro: 'স্টক বদলায় শুধু অর্ডার চূড়ান্ত বা বাতিল হলে, অথবা অ্যাডমিন সমন্বয় করলে। বাঁ পাশের মেনুতে "স্টক ব্যালেন্স" ক্লিক করুন।',
      parts: [
        {
          shot: 'stock-balance', title: 'স্টক ব্যালেন্স',
          steps: [
            'পণ্য খুঁজুন।',
            'শুধু কম স্টক — সতর্কতার মাত্রার নিচের পণ্যগুলো দেখুন।',
            'লাল সংখ্যা মানে স্টক সতর্কতার মাত্রার নিচে — আবার কেনার সময়।',
            'স্টক সমন্বয় (অ্যাডমিন) — শুরুর স্টক, নষ্ট, হারানো ও সংশোধনের জন্য। লেজারে প্রতিটি চলাচল দেখা যায়।',
          ],
        },
        {
          shot: 'stock-adjust', title: 'স্টক সমন্বয়',
          steps: [
            'পণ্য — নিচে বর্তমান স্টক দেখায়।',
            'বৃদ্ধি বা হ্রাস।',
            'পরিমাণ।',
            'কারণ: শুরুর স্টক, নষ্ট, হারানো, সংশোধন বা অন্যান্য।',
            'সমন্বয়ের তারিখ।',
            'নোট (ঐচ্ছিক)। তারপর "সমন্বয় পোস্ট করুন" ক্লিক করুন।',
          ],
        },
      ],
    },
    reports: {
      intro: 'রিপোর্ট (বাঁ পাশের মেনু) শুধু চূড়ান্ত অর্ডার গোনে। প্রতিটি রিপোর্ট PDF হিসেবে প্রিন্ট বা শেয়ার করা যায়।',
      parts: [
        {
          shot: 'due-report', title: 'বাকির রিপোর্ট',
          steps: [
            'গ্রাহকের বাকি (আপনার পাওনা) বা সরবরাহকারীর বাকি (আপনার দেনা)।',
            'অর্ডারের তারিখ — তারিখের সীমা বেছে নিন।',
            'প্রিন্ট / শেয়ার — রিপোর্টটি PDF হিসেবে।',
            'প্রতিটি অপরিশোধিত অর্ডার এবং কত দিন ধরে বাকি। ক্লিক করলে অর্ডার খোলে, সেখান থেকে পেমেন্ট যোগ করুন।',
          ],
        },
        {
          shot: 'customer-report', title: 'গ্রাহক রিপোর্ট',
          steps: [
            'মোট: অর্ডারের সংখ্যা, অর্ডারের মোট, পরিশোধিত ও বাকি।',
            'গ্রাহক খুঁজুন, তারিখের সীমা দিন বা শুধু বাকি থাকা গ্রাহক দেখুন।',
            'প্রতি গ্রাহক এক লাইন। ডানের বোতামে ওই গ্রাহকের অর্ডার খোলে — সেখান থেকে প্রিন্ট করুন।',
            'প্রিন্ট / শেয়ার — পুরো রিপোর্ট।',
          ],
        },
      ],
      tips: ['সরবরাহকারী রিপোর্ট ও কোম্পানি রিপোর্ট একইভাবে কাজ করে। বিক্রয় অর্ডারের তালিকায় একজন গ্রাহক বেছে নিয়ে "প্রিন্ট / শেয়ার" ক্লিক করলে শুধু তার অর্ডারগুলো প্রিন্ট হয়।'],
    },
    team: {
      parts: [
        {
          shot: 'invite', title: 'কর্মীদের আমন্ত্রণ (বাঁ পাশের মেনু → ব্যবহারকারী)',
          steps: [
            'আপনার ব্যবসার কোড। কর্মীরা "অ্যাকাউন্ট তৈরি করুন → একটি ব্যবসায় যোগ দিন" বেছে নিয়ে এটি লিখবেন।',
            'কোড কপি করুন, অথবা নিবন্ধনের লিংক কপি করে WhatsApp বা ইমেইলে পাঠান।',
          ],
        },
        {
          shot: 'user-form', title: 'প্রত্যেককে ভূমিকা দিন',
          steps: [
            'ভূমিকা: অ্যাডমিন (সবকিছু), ম্যানেজার (বিক্রয়, গ্রাহক ও স্টক) বা ব্যবহারকারী (শুধু দেখা)।',
            'যে গ্রাহক বা সরবরাহকারী লগ ইন করেন: তার ব্যবহারকারী অ্যাকাউন্টটি তার সঙ্গে যুক্ত করুন, তাহলে তিনি শুধু নিজের অর্ডার ও বাকি দেখবেন।',
            'এটি খুলতে কারও পাশের পেন্সিলে ক্লিক করুন। কেউ পাসওয়ার্ড ভুলে গেলে এখানে নতুন পাসওয়ার্ড দিন — পরের লগ ইনে তাকে সেটি বদলাতে হবে। তারপর "সংরক্ষণ করুন" ক্লিক করুন।',
          ],
        },
      ],
      tips: ['বারবার ভুল পাসওয়ার্ডে লক হয়ে গেছে? ব্যবহারকারী পাতায় ওই ব্যক্তির পাশের তালার চিহ্নে ক্লিক করুন।'],
    },
    sms: {
      intro: 'অর্ডার চূড়ান্ত হলে এবং পেমেন্ট যোগ হলে অ্যাপ গ্রাহক ও সরবরাহকারীকে মোট, পরিশোধিত ও বাকিসহ SMS পাঠাতে পারে। বাঁ পাশের মেনুতে "সেটিংস" ক্লিক করুন।',
      parts: [
        {
          shot: 'settings',
          steps: [
            'গ্রাহক ও সরবরাহকারীকে SMS পাঠান — আপনার ব্যবসার মূল সুইচ।',
            'নতুন অর্ডারে SMS চালু রাখুন — নতুন অর্ডার SMS চালু অবস্থায় শুরু হয়।',
          ],
        },
        {
          shot: 'sms-log', title: 'SMS লগ (বাঁ পাশের মেনু)',
          steps: [
            'আপনার SMS ব্যালেন্স: কতটি SMS বাকি এবং কবে মেয়াদ শেষ।',
            'সব বার্তা, অথবা শুধু অপেক্ষমাণ, পাঠানো, ব্যর্থ বা বাদ পড়া বার্তা দেখুন।',
            'প্রতিটি বার্তা, তার লেখা ও অবস্থা। ব্যর্থ বা বাদ পড়া বার্তায় "আবার চেষ্টা" বোতাম থাকে।',
          ],
        },
      ],
      tips: [
        'SMS যায় শুধু তিনটিই চালু থাকলে: ব্যবসার সুইচ, গ্রাহকের SMS সুইচ এবং অর্ডারের "SMS পাঠান" সুইচ।',
        'প্রতিটি বার্তা আপনার ব্যালেন্স থেকে SMS নেয় — বড় বার্তায় 2 বা তার বেশি লাগে। SMS না থাকলে বার্তা বাদ পড়া (Skipped) থাকে; আবার SMS পেলে "আবার চেষ্টা" চাপুন।',
      ],
    },
    billing: {
      intro: 'বাঁ পাশের মেনুতে "বিলিং" ক্লিক করলে আপনার প্যাকেজ, SMS ব্যালেন্স ও পেমেন্টগুলো দেখা যায়। নতুন ব্যবসা ফ্রি ট্রায়াল দিয়ে শুরু করে।',
      parts: [
        {
          shot: 'billing',
          steps: [
            'SMS ব্যালেন্স — কতটি SMS বাকি এবং কবে মেয়াদ শেষ। প্রতিটি কেনা দেখতে "SMS প্যাক" খুলুন।',
            'SMS কিনুন — শুধু SMS, যেকোনো সময়, যেমন প্যাকেজের মাঝখানে SMS শেষ হয়ে গেলে।',
            'আপনার ব্যবসার আকারের প্যাকেজ — মাসিক, 3 মাস ও আরও বেশি। আগে পরিশোধ করলে কোনো দিন নষ্ট হয় না: সময়টা বর্তমান মেয়াদের পরে যোগ হয়।',
            'বিকাশে পরিশোধ করুন। একই পেমেন্টে SMS কিনতে "এই পেমেন্টে SMS যোগ করুন" চালু করতে পারেন।',
          ],
        },
        {
          shot: 'buy-sms', title: 'SMS কিনুন',
          steps: [
            'কতটি SMS: একটি সংখ্যা বেছে নিন বা নিজে লিখুন।',
            'দাম: সংখ্যা × প্রতি SMS-এর দাম।',
            'বিকাশে পরিশোধ করুন। পরিশোধের পর বিলিং পাতায় ফিরে আসবেন এবং SMS সঙ্গে সঙ্গে যোগ হয়ে যাবে।',
          ],
        },
      ],
      tips: ['কেনা SMS কেনার দিন থেকে কয়েক মাস চলে। পুরোনো SMS আগে খরচ হয়।'],
    },
    portal: {
      parts: [
        {
          shot: 'portal',
          steps: [
            'এই ব্যবসার সঙ্গে আপনার সারাংশ: অর্ডার, মোট, পরিশোধিত ও বাকি।',
            'আপনার অর্ডার। ক্লিক করলে পণ্য ও পেমেন্ট দেখা যায় এবং ইনভয়েস ডাউনলোড করা যায়।',
            'বাঁ পাশের মেনু: আপনার কেনাকাটা, বাকির রিপোর্ট এবং এই নির্দেশিকা।',
          ],
        },
      ],
    },
    account: {
      intro: 'উপরে ডানে আপনার নামে ক্লিক করে "আমার প্রোফাইল" খুলুন।',
      parts: [
        {
          shot: 'profile',
          steps: [
            'পাসওয়ার্ড পরিবর্তন।',
            'অ্যাকাউন্ট মুছুন — আপনার অ্যাকাউন্ট মুছে যায়। আপনি একমাত্র অ্যাডমিন হলে পুরো ব্যবসা বন্ধ হয় এবং এর সব রেকর্ড মুছে যায়। এটি আর ফেরানো যায় না।',
          ],
        },
      ],
    },
  },
};
