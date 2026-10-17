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
            'Your business at a glance: today\'s sales, this month\'s sales and purchases, what customers owe you, what you owe suppliers and the drafts waiting to be finalized. Click a tile to open the list behind it.',
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
      intro: 'A sale has three steps: 1) make the order and Save draft, 2) Finalize it — the stock goes out, 3) add the payments. A draft does not change your stock, so you can fix it as often as you like.',
      parts: [
        {
          shot: 'sales-list', title: 'Step 1 — Sales orders (left menu)',
          steps: [
            'New sales order — start a new order. (New sale on the Dashboard does the same.)',
            'Show All orders, or only Draft, Final or Void ones.',
            'Search by order number or customer.',
            'Show one customer\'s orders. Pick a date range next to it; Print / share at the top prints the list.',
            'Each order with its status, total, paid and due. Click a row to open it.',
          ],
        },
        {
          shot: 'sales-new', title: 'Step 2 — fill in the order',
          steps: [
            'Customer — type part of the name, code or mobile number and pick from the list.',
            'Payment type: Cash, Due (pay later) or Installment.',
            'Order date — today by default. You can pick an earlier or later date. Notes below it are printed on the invoice.',
            'Send SMS to the customer — on: the customer gets an SMS when the order is finalized and for each payment.',
            'Product — type part of the name or code and pick it. The box size and your stock appear under it.',
            'Type — sell by BOX, or by the piece, kg or litre.',
            'Quantity — here 5 boxes. The total pieces fill in.',
            'Price per piece and per box fill in from the product. Change them to give a discount.',
            'Line total — updates by itself. The order total is below it.',
            'Add line — for the next product.',
            'Save draft — the order is saved as a draft and opens. This button stays at the top while you scroll.',
          ],
        },
        {
          shot: 'sales-missing', title: 'Something missing?',
          steps: [
            'When you click Save draft with something missing, that box turns red and the cursor goes to it.',
            'This message says what to fill in, for example "Choose a product on line 1." Fill it in and click Save draft again.',
          ],
        },
        {
          shot: 'order-draft', title: 'Step 3 — finalize',
          steps: [
            'Finalize — confirms the order when the goods are sold.',
            'Edit — change the draft as often as you like before finalizing.',
            '⋮ — more actions, such as Delete draft.',
          ],
        },
        {
          shot: 'finalize-confirm', title: 'Confirm',
          steps: [
            'What will happen: the stock goes out, the order can no longer be edited, and who gets an SMS.',
            'Click Finalize. Now you can add payments and print the invoice (see "Payments and invoices").',
          ],
        },
      ],
      tips: [
        'Press Tab to move from box to box without the mouse.',
        'You cannot sell more than you have in stock — the line shows "Not enough stock" and the order cannot be finalized.',
      ],
    },
    purchase: {
      intro: 'A purchase order records goods you buy from a supplier. When you finalize it, the stock goes up. Click New purchase on the Dashboard, or Purchase orders in the left menu and then New purchase order.',
      parts: [
        {
          shot: 'purchase-new', title: 'Fill in the order',
          steps: [
            'Supplier — type part of the name and pick from the list.',
            'Payment type (Cash, Due or Installment) and the order date. Notes are optional, for example the supplier\'s invoice number.',
            'Product, type and quantity — here 20 boxes.',
            'The purchase price fills in from the product. Change it if the supplier charged a different price; the line total updates.',
            'Save draft.',
          ],
        },
        {
          shot: 'purchase-draft', title: 'Finalize',
          steps: [
            'Finalize — when the goods have arrived. The stock goes up and the order can no longer be edited.',
            'Edit — change the draft before finalizing.',
          ],
        },
      ],
      tips: ['Paid the supplier? Open the finalized purchase order and click Add payment, the same as for a sale.'],
    },
    finalize: {
      intro: 'After an order is finalized, record each payment on it and print or share the invoice.',
      parts: [
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
    'sms-buy': {
      intro: 'SMS are bought in advance on the Billing page (left menu) and paid with bKash. You can buy them on their own at any time, or together with your package.',
      parts: [
        {
          shot: 'sms-balance', title: 'Your SMS balance',
          steps: [
            'How many SMS you have left and when they expire.',
            'Buy SMS.',
            'Your price per SMS and how long a pack lasts. A long message uses 2 or more SMS.',
            'SMS packs — every pack you bought or were given, with how many are used and left.',
          ],
        },
        {
          shot: 'buy-sms', title: 'Buy SMS only',
          steps: [
            'How many SMS — click a number…',
            '…or type your own (at least the minimum shown below it).',
            'The total: number × price per SMS.',
            'Pay with bKash. After paying you come back to Billing and the SMS are added straight away.',
          ],
        },
        {
          shot: 'plan-sms', title: 'SMS together with your package',
          steps: [
            'The package you are paying for.',
            'Add SMS to this payment — switch it on.',
            'How many SMS.',
            'The total: package + SMS.',
            'Pay with bKash — one payment for both.',
          ],
        },
      ],
      tips: ['Bought SMS last for a few months from the day you buy them. Older SMS are used first, so nothing is wasted.'],
    },
    billing: {
      intro: 'Click Billing in the left menu to see your package, your SMS balance and your payments. New businesses start with a free trial.',
      parts: [
        {
          shot: 'billing',
          steps: [
            'Packages for your business size — monthly, 3 months and longer. Paying early never loses days: the time is added after your current end date.',
            'Pay with bKash. After paying you return to Billing and your new end date is shown. Every payment is listed under Payment history.',
          ],
        },
      ],
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
            'এক নজরে আপনার ব্যবসা: আজকের বিক্রয়, এই মাসের বিক্রয় ও ক্রয়, গ্রাহকদের কাছে পাওনা, সরবরাহকারীদের দেনা এবং চূড়ান্ত করার অপেক্ষায় থাকা খসড়া। কোনো টাইলে ক্লিক করলে তার তালিকা খোলে।',
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
      intro: 'বিক্রয়ের তিনটি ধাপ: ১) অর্ডার তৈরি করে "খসড়া সংরক্ষণ", ২) "চূড়ান্ত করুন" — স্টক বের হয়ে যায়, ৩) পেমেন্ট যোগ করা। খসড়া স্টক বদলায় না, তাই যতবার খুশি ঠিক করতে পারেন।',
      parts: [
        {
          shot: 'sales-list', title: 'ধাপ ১ — বিক্রয় অর্ডার (বাঁ পাশের মেনু)',
          steps: [
            'নতুন বিক্রয় অর্ডার — নতুন অর্ডার শুরু করুন। (ড্যাশবোর্ডের "নতুন বিক্রয়"-ও একই কাজ করে।)',
            'সব অর্ডার, অথবা শুধু খসড়া, চূড়ান্ত বা বাতিল অর্ডার দেখুন।',
            'অর্ডার নম্বর বা গ্রাহক দিয়ে খুঁজুন।',
            'একজন গ্রাহকের অর্ডার দেখুন। পাশে তারিখের সীমা দিন; উপরের "প্রিন্ট / শেয়ার" তালিকাটি প্রিন্ট করে।',
            'প্রতিটি অর্ডারের অবস্থা, মোট, পরিশোধিত ও বাকি। সারিতে ক্লিক করলে অর্ডার খোলে।',
          ],
        },
        {
          shot: 'sales-new', title: 'ধাপ ২ — অর্ডার পূরণ করুন',
          steps: [
            'গ্রাহক — নাম, কোড বা মোবাইল নম্বরের কিছু অংশ লিখে তালিকা থেকে বেছে নিন।',
            'পেমেন্টের ধরন: নগদ, বাকি (পরে পরিশোধ) বা কিস্তি।',
            'অর্ডারের তারিখ — শুরুতে আজকের তারিখ। আগের বা পরের তারিখও দিতে পারেন। নিচের নোট ইনভয়েসে ছাপা হয়।',
            'গ্রাহককে SMS পাঠান — চালু থাকলে অর্ডার চূড়ান্ত হলে এবং প্রতিটি পেমেন্টে গ্রাহক SMS পান।',
            'পণ্য — নাম বা কোডের কিছু অংশ লিখে বেছে নিন। নিচে বক্সের মাপ ও আপনার স্টক দেখায়।',
            'ধরন — বক্সে, অথবা পিস, কেজি বা লিটারে বিক্রি।',
            'পরিমাণ — এখানে ৫ বক্স। মোট পিস নিজে থেকে বসে।',
            'প্রতি পিস ও প্রতি বক্সের দাম পণ্য থেকে বসে। ছাড় দিতে বদলান।',
            'লাইনের মোট — নিজেই বদলায়। নিচে অর্ডারের মোট।',
            'লাইন যোগ করুন — পরের পণ্যের জন্য।',
            'খসড়া সংরক্ষণ — অর্ডারটি খসড়া হিসেবে সংরক্ষণ হয়ে খুলে যায়। স্ক্রল করলেও এই বোতাম উপরে থাকে।',
          ],
        },
        {
          shot: 'sales-missing', title: 'কিছু বাদ পড়েছে?',
          steps: [
            'কিছু বাদ রেখে "খসড়া সংরক্ষণ" ক্লিক করলে সেই ঘরটি লাল হয় এবং কার্সর সেখানে চলে যায়।',
            'এই বার্তায় লেখা থাকে কী পূরণ করতে হবে, যেমন "১ নম্বর লাইনে একটি পণ্য বেছে নিন।" সেটি পূরণ করে আবার "খসড়া সংরক্ষণ" ক্লিক করুন।',
          ],
        },
        {
          shot: 'order-draft', title: 'ধাপ ৩ — চূড়ান্ত করুন',
          steps: [
            'চূড়ান্ত করুন — মাল বিক্রি হলে অর্ডারটি নিশ্চিত করুন।',
            'সম্পাদনা — চূড়ান্ত করার আগে যতবার খুশি খসড়া বদলান।',
            '⋮ — আরও কাজ, যেমন খসড়া মুছুন।',
          ],
        },
        {
          shot: 'finalize-confirm', title: 'নিশ্চিত করুন',
          steps: [
            'কী হবে: স্টক বের হবে, অর্ডারটি আর সম্পাদনা করা যাবে না, এবং কে SMS পাবেন।',
            '"চূড়ান্ত করুন" ক্লিক করুন। এখন পেমেন্ট যোগ করতে ও ইনভয়েস প্রিন্ট করতে পারবেন ("পেমেন্ট ও ইনভয়েস" দেখুন)।',
          ],
        },
      ],
      tips: [
        'মাউস ছাড়াই এক ঘর থেকে পরের ঘরে যেতে Tab চাপুন।',
        'স্টকের বেশি বিক্রি করা যায় না — লাইনে "পর্যাপ্ত স্টক নেই" দেখায় এবং অর্ডার চূড়ান্ত করা যায় না।',
      ],
    },
    purchase: {
      intro: 'ক্রয় অর্ডারে সরবরাহকারীর কাছ থেকে কেনা মাল লেখা হয়। চূড়ান্ত করলে স্টক বাড়ে। ড্যাশবোর্ডে "নতুন ক্রয়" ক্লিক করুন, অথবা বাঁ পাশের মেনুতে "ক্রয় অর্ডার" ক্লিক করে "নতুন ক্রয় অর্ডার"।',
      parts: [
        {
          shot: 'purchase-new', title: 'অর্ডার পূরণ করুন',
          steps: [
            'সরবরাহকারী — নামের কিছু অংশ লিখে তালিকা থেকে বেছে নিন।',
            'পেমেন্টের ধরন (নগদ, বাকি বা কিস্তি) ও অর্ডারের তারিখ। নোট ঐচ্ছিক, যেমন সরবরাহকারীর ইনভয়েস নম্বর।',
            'পণ্য, ধরন ও পরিমাণ — এখানে ২০ বক্স।',
            'ক্রয়মূল্য পণ্য থেকে বসে। সরবরাহকারী অন্য দাম নিলে বদলান; লাইনের মোট নিজেই বদলাবে।',
            'খসড়া সংরক্ষণ।',
          ],
        },
        {
          shot: 'purchase-draft', title: 'চূড়ান্ত করুন',
          steps: [
            'চূড়ান্ত করুন — মাল হাতে পেলে। স্টক বাড়ে এবং অর্ডারটি আর সম্পাদনা করা যায় না।',
            'সম্পাদনা — চূড়ান্ত করার আগে খসড়া বদলান।',
          ],
        },
      ],
      tips: ['সরবরাহকারীকে টাকা দিয়েছেন? চূড়ান্ত ক্রয় অর্ডারটি খুলে "পেমেন্ট যোগ করুন" ক্লিক করুন, বিক্রয়ের মতোই।'],
    },
    finalize: {
      intro: 'অর্ডার চূড়ান্ত হওয়ার পর এতে প্রতিটি পেমেন্ট লিখুন এবং ইনভয়েস প্রিন্ট বা শেয়ার করুন।',
      parts: [
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
    'sms-buy': {
      intro: 'SMS আগে থেকে কিনতে হয় বিলিং পাতায় (বাঁ পাশের মেনু), টাকা দেওয়া যায় বিকাশে। যেকোনো সময় শুধু SMS কিনতে পারেন, অথবা প্যাকেজের সাথে একসাথে।',
      parts: [
        {
          shot: 'sms-balance', title: 'আপনার SMS ব্যালেন্স',
          steps: [
            'কতটি SMS বাকি আছে এবং কবে মেয়াদ শেষ হবে।',
            'SMS কিনুন।',
            'প্রতি SMS-এর দাম এবং একটি প্যাক কতদিন চলে। বড় বার্তায় ২ বা তার বেশি SMS লাগে।',
            'SMS প্যাক — আপনার কেনা বা পাওয়া প্রতিটি প্যাক, কতটি ব্যবহার হয়েছে ও কতটি বাকি।',
          ],
        },
        {
          shot: 'buy-sms', title: 'শুধু SMS কেনা',
          steps: [
            'কতটি SMS — একটি সংখ্যায় ক্লিক করুন…',
            '…অথবা নিজে লিখুন (নিচে দেখানো সর্বনিম্ন সংখ্যার কম নয়)।',
            'মোট: সংখ্যা × প্রতি SMS-এর দাম।',
            'বিকাশে পরিশোধ করুন। পরিশোধের পর বিলিং পাতায় ফিরে আসবেন এবং SMS সঙ্গে সঙ্গে যোগ হয়ে যাবে।',
          ],
        },
        {
          shot: 'plan-sms', title: 'প্যাকেজের সাথে SMS',
          steps: [
            'যে প্যাকেজের টাকা দিচ্ছেন।',
            '"এই পেমেন্টে SMS যোগ করুন" — চালু করুন।',
            'কতটি SMS।',
            'মোট: প্যাকেজ + SMS।',
            'বিকাশে পরিশোধ করুন — দুটোর জন্য একটিই পেমেন্ট।',
          ],
        },
      ],
      tips: ['কেনা SMS কেনার দিন থেকে কয়েক মাস চলে। পুরোনো SMS আগে খরচ হয়, তাই কিছু নষ্ট হয় না।'],
    },
    billing: {
      intro: 'বাঁ পাশের মেনুতে "বিলিং" ক্লিক করলে আপনার প্যাকেজ, SMS ব্যালেন্স ও পেমেন্টগুলো দেখা যায়। নতুন ব্যবসা ফ্রি ট্রায়াল দিয়ে শুরু করে।',
      parts: [
        {
          shot: 'billing',
          steps: [
            'আপনার ব্যবসার আকারের প্যাকেজ — মাসিক, ৩ মাস ও আরও বেশি। আগে পরিশোধ করলে কোনো দিন নষ্ট হয় না: সময়টা বর্তমান মেয়াদের পরে যোগ হয়।',
            'বিকাশে পরিশোধ করুন। পরিশোধের পর বিলিং পাতায় ফিরে নতুন মেয়াদ দেখতে পাবেন। প্রতিটি পেমেন্ট "পেমেন্টের ইতিহাস"-এ থাকে।',
          ],
        },
      ],
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
