import { Role } from '../../core/models';
import { DESKTOP } from './guide-desktop';

/**
 * The user guide, in English and Bangla.
 *
 * Every part pairs one annotated phone screenshot (public/guide/{lang}/{shot}.webp) with its
 * steps: marker 1 on the picture is step 1, and so on. Steps after the last marker carry on
 * from where the picture stops. Screenshots are phone-size (720 px wide) captures of the app
 * with numbered markers drawn on; when a screen changes, replace its picture in both languages
 * and check the steps still match the markers.
 *
 * The billing section is web only: Google Play does not allow payment instructions in the app.
 *
 * Two versions: the phone (these sections) and the computer (guide-desktop.ts, wide screenshots
 * under public/guide/{lang}/desktop/). The reader switches between them at the top of the guide.
 */

export type GuideLang = 'en' | 'bn';
export type GuideDevice = 'mobile' | 'desktop';

/** One annotated screenshot and its steps; the numbered markers on the picture match the step numbers. */
export interface GuidePart {
  /** File name under public/guide/{lang}/, without ".webp". Omit for a text-only part. */
  shot?: string;
  title?: string;
  steps: string[];
}

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  intro?: string;
  parts: GuidePart[];
  tips?: string[];
  faq?: { q: string; a: string }[];
  /** Who sees it when signed in; everyone when omitted. */
  roles?: Role[];
  /** Hidden in the Android app (Google Play: no payment instructions in the app). */
  webOnly?: boolean;
}

/** A section on a computer: its own pictures and steps; intro and tips replace the phone's when given. */
export interface GuideDesktop {
  intro?: string;
  parts?: GuidePart[];
  tips?: string[];
}

export interface GuideText {
  title: string; subtitle: string; contents: string; section: string; enlarge: string;
  mobile: string; desktop: string; device: string;
}

const STAFF: Role[] = ['ADMIN', 'MANAGER'];
const ADMIN: Role[] = ['ADMIN'];

// =====================================================================================
// English
// =====================================================================================
const EN: GuideSection[] = [
  {
    id: 'start', icon: 'rocket_launch', title: 'Getting started',
    intro: 'Use the app on your phone (Android app) or on a computer (website). It is the same account and the same data on both.',
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
          'Enter your business name. The business code below is filled in for you — your staff use it to join.',
          'Choose your business size.',
          'Enter your own details: full name, email and mobile number.',
          'Scroll down, choose a password (at least 8 characters with a letter and a number) and tap Create business account. You are signed in straight away.',
        ],
      },
      {
        shot: 'register-join', title: 'Join your business (staff)',
        steps: [
          'Enter the business code your admin gave you.',
          'Enter your full name, email, mobile number and a password, then tap Create account.',
          'New members start with read-only access. Ask your admin to give you a role (see "Your team and roles").',
        ],
      },
      {
        shot: 'login', title: 'Log in',
        steps: [
          'Your email address.',
          'Your password. Tap the eye to see what you typed.',
          'Tap Log in.',
          'Forgot your password? Tap here and we email you a link to set a new one.',
          'No account yet? Tap Create an account.',
        ],
      },
    ],
    tips: [
      'English or বাংলা: tap the language switch at the top of the log-in page, or later in More → Language.',
      'On a computer, open tasifmatrix.com.bd in any browser and log in with the same email and password.',
    ],
  },
  {
    id: 'home', icon: 'dashboard', title: 'Home screen and menu', roles: STAFF,
    parts: [
      {
        shot: 'dashboard',
        steps: [
          'New sale — start a sales order straight away.',
          'New purchase — record goods you bought (admins).',
          'Your business at a glance: today\'s sales, this month\'s sales and purchases, what customers owe you, what you owe suppliers and the drafts waiting to be finalized. Tap a tile to open the list behind it.',
          'The bottom bar: Home, Sales, Purchases and Stock.',
          'More — every other screen: customers, products, reports, settings and this guide.',
        ],
      },
      {
        shot: 'more', title: 'The More menu',
        steps: [
          'User guide — open this guide any time.',
          'Language — switch the whole app between English and বাংলা.',
          'Appearance — light or dark mode.',
          'My profile — your details, password and account.',
        ],
      },
    ],
    tips: ['On a computer the full menu is on the left side of the screen instead of the bottom bar.'],
  },
  {
    id: 'company', icon: 'apartment', title: 'Your company details', roles: ADMIN,
    intro: 'Your company is created when you register, and every order belongs to it automatically. Its name, address and phone are printed on every invoice, receipt and report, so keep them correct. Open More → Companies, tap ⋮ next to your company and choose Edit.',
    parts: [
      {
        shot: 'company-form',
        steps: [
          'Company name, exactly as it should appear on invoices.',
          'A short company code, for example SE.',
          'Address and city.',
          'Phone number for your customers. Then tap Save.',
        ],
      },
    ],
  },
  {
    id: 'products', icon: 'category', title: 'Products', roles: STAFF,
    intro: 'Add every item you buy or sell before you make orders. Open More → Products and tap the + button.',
    parts: [
      {
        shot: 'product-form',
        steps: [
          'Product name and a code you recognise, for example SOAP-01.',
          'Unit: PCS (pieces), KG, LITRE or BOX. Stock is counted in this unit.',
          'For BOX: what one box holds — for example 12 pieces per box. Then you can sell by the box or by the piece.',
          'Purchase price per unit (per piece, kg or litre).',
          'Sales price per unit. Orders fill in both prices for you; you can still change them on each order. Scroll down for the low stock alert (optional), then tap Save.',
        ],
      },
    ],
    tips: ['Prices are always per piece, kg or litre. The app works out the box price for you.'],
  },
  {
    id: 'parties', icon: 'groups', title: 'Customers and suppliers', roles: STAFF,
    intro: 'Open More → Customers (or Suppliers) and tap the + button. Each customer and supplier gets a code like 100001 automatically.',
    parts: [
      {
        shot: 'customer-form',
        steps: [
          'Name of the customer or shop.',
          'Mobile number. Order and payment SMS go to this number.',
          'City and address (optional, printed on invoices).',
          'Scroll down: the SMS switch is on by default. Turn it off for a customer who should not get SMS. Then tap Save.',
        ],
      },
    ],
    tips: ['Suppliers are added the same way under More → Suppliers (admins).'],
  },
  {
    id: 'sales', icon: 'point_of_sale', title: 'Create a sales order', roles: STAFF,
    intro: 'A sale has three steps: 1) make the order and Save draft, 2) Finalize it — the stock goes out, 3) add the payments. A draft does not change your stock, so you can fix it as often as you like.',
    parts: [
      {
        shot: 'sales-list', title: 'Step 1 — open Sales',
        steps: [
          'Tap the + button to start a new sales order. (On the Home screen, New sale does the same.)',
          'Search by order number or customer.',
          'Show All orders, or only Draft, Final or Void ones.',
          'Each order with its total, paid and due. Tap an order to open it.',
        ],
      },
      {
        shot: 'sales-new', title: 'Step 2 — customer and payment',
        steps: [
          'Customer — tap and type part of the name, code or mobile number, then pick from the list.',
          'Payment type: Cash, Due (pay later) or Installment.',
          'Order date — today by default. You can pick an earlier or later date.',
          'Notes (optional), for example the delivery time. They are printed on the invoice.',
          'Send SMS to the customer — on: the customer gets an SMS when the order is finalized and for each payment.',
        ],
      },
      {
        shot: 'sales-product', title: 'Step 3 — choose a product',
        steps: [
          'Scroll down to Line items. In Product, type part of the product name or code.',
          'Pick it from the list. The list shows the stock you have and the sales price.',
        ],
      },
      {
        shot: 'sales-lines', title: 'Step 4 — quantity and price',
        steps: [
          'Type — sell by BOX, or by the piece, kg or litre.',
          'Quantity — here 5 boxes.',
          'The total pieces and the price per piece fill in for you.',
          'Price per box — worked out for you. Change any price to give a discount.',
          'Line total — updates by itself.',
          'Add line — for the next product.',
          'The order total. Tap Save draft — the order is saved as a draft and opens.',
        ],
      },
      {
        shot: 'sales-missing', title: 'Something missing?',
        steps: [
          'When you tap Save draft with something missing, that box turns red.',
          'This message says what to fill in, for example "Choose a product on line 1." Fill it in and tap Save draft again.',
        ],
      },
      {
        shot: 'order-draft', title: 'Step 5 — finalize',
        steps: [
          'Finalize — confirms the order when the goods are sold.',
          'Edit — change the draft as often as you like before finalizing.',
          '⋮ — more actions, such as Delete draft.',
        ],
      },
      {
        shot: 'finalize-confirm', title: 'Confirm',
        steps: [
          'The app tells you what will happen: the stock goes out, the order can no longer be edited, and who gets an SMS.',
          'Tap Finalize. Now you can add payments and share the invoice (see the next sections).',
        ],
      },
    ],
    tips: [
      'You cannot sell more than you have in stock — the line shows "Not enough stock" and the order cannot be finalized.',
      'Sell one product by the box and by the piece? Add it on two lines: one with BOX, one with PCS.',
    ],
  },
  {
    id: 'purchase', icon: 'shopping_cart', title: 'Create a purchase order', roles: ADMIN,
    intro: 'A purchase order records goods you buy from a supplier. When you finalize it, the stock goes up. Tap New purchase on the Home screen, or Purchases → + .',
    parts: [
      {
        shot: 'purchase-new', title: 'Supplier and payment',
        steps: [
          'Supplier — type part of the name and pick from the list.',
          'Payment type: Cash, Due (you pay later) or Installment.',
          'Order date — today by default.',
          'Notes (optional), for example the supplier\'s invoice number.',
          'Send SMS to the supplier — off unless you turn it on.',
        ],
      },
      {
        shot: 'purchase-lines', title: 'Products',
        steps: [
          'Product — type part of the name and pick it.',
          'Type and quantity — here 20 boxes.',
          'The purchase price fills in from the product. Change it if the supplier charged a different price; the line total updates.',
          'The order total. Tap Save draft. Tap Add line first if you bought more products.',
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
    tips: ['Paid the supplier? Open the finalized purchase order and tap Add payment, the same as for a sale.'],
  },
  {
    id: 'finalize', icon: 'task_alt', title: 'Payments and invoices', roles: STAFF,
    intro: 'After an order is finalized, record each payment on it and share the invoice.',
    parts: [
      {
        shot: 'order-final', title: 'A finalized order',
        steps: [
          'Add payment — record money you received (or paid a supplier). The button shows how much is still due.',
          'SMS switch for this order.',
          'Order details: customer, order date, payment type, total, paid and due.',
          '⋮ — open or download the invoice as a PDF and share it (WhatsApp, email). Void cancels a finalized order and returns its stock (remove its payments first).',
        ],
      },
      {
        shot: 'payment-dialog', title: 'Add a payment',
        steps: [
          'Amount received.',
          'Method: Cash, Bank, Mobile banking (bKash, Nagad), Cheque or Other.',
          'Payment date.',
          'Pay full due — fills in the whole remaining amount.',
          'Note, for example the bKash transaction ID. Then tap Add payment.',
        ],
      },
    ],
    tips: [
      'Customers pay in parts? Add a payment each time; the due amount goes down and every payment is listed in the payment history.',
      'Due report shows every order that still has money due.',
      'Printing a small receipt on a POS (thermal) printer is done from a computer — see the Desktop guide.',
    ],
  },
  {
    id: 'stock', icon: 'inventory', title: 'Stock', roles: STAFF,
    intro: 'Stock changes only when an order is finalized or voided, or when an admin posts an adjustment. Open Stock from the bottom bar.',
    parts: [
      {
        shot: 'stock-balance', title: 'Stock balance',
        steps: [
          'Search for a product.',
          'Low stock only — show just the products below their alert level.',
          'A red "Low stock" badge means it is time to reorder.',
          'Adjust stock (admins) — for opening stock, damage, loss and corrections.',
        ],
      },
      {
        shot: 'stock-adjust', title: 'Stock adjustment',
        steps: [
          'Product — the current stock is shown below it.',
          'Increase or Decrease.',
          'Quantity.',
          'Reason: Opening stock, Damage, Loss, Correction or Other.',
          'Note (optional). Then tap Post adjustment.',
        ],
      },
    ],
    tips: [
      'Starting out? Post an "Opening stock" adjustment for each product so the app knows what you already have.',
      'Adjustments cannot be edited. To undo one, post the opposite adjustment.',
      'Stock ledger (More → Stock ledger) lists every movement with the balance after it.',
    ],
  },
  {
    id: 'reports', icon: 'bar_chart', title: 'Reports and dues', roles: STAFF,
    intro: 'Reports count finalized orders only. Every report can be printed or shared as a PDF.',
    parts: [
      {
        shot: 'due-report', title: 'Due report',
        steps: [
          'Customer dues (money owed to you) or Supplier dues (money you owe).',
          'Order date — show a date range.',
          'Print / share the report as a PDF.',
          'Each unpaid order with the days it has been due. Tap it to open the order and add a payment.',
        ],
      },
      {
        shot: 'customer-report', title: 'Customer report',
        steps: [
          'Totals: number of orders, order total, paid and due.',
          'Search a customer, pick a date range or show only customers with a due.',
          'One card per customer. Tap it to open that customer\'s orders — and print them from there with Print / share.',
          'Print / share the whole report.',
        ],
      },
    ],
    tips: ['Supplier report and Company report (More menu) work the same way.'],
  },
  {
    id: 'team', icon: 'manage_accounts', title: 'Your team and roles', roles: ADMIN,
    parts: [
      {
        shot: 'invite', title: 'Invite your staff',
        steps: [
          'Your business code. Staff choose Create account → Join a business and enter it.',
          'Copy code, or Copy sign-up link to send it on WhatsApp. (You also find this card in More → Settings.)',
        ],
      },
      {
        shot: 'user-form', title: 'Give each person a role',
        steps: [
          'Role: Admin (everything), Manager (sales, customers and stock) or User (read-only).',
          'For a customer or supplier who logs in: link their User account to them, so they see only their own orders and dues.',
          'Open More → Users and tap ⋮ next to a person, then Edit. Set a new password here if someone forgot theirs — they must change it at the next log-in. Then tap Save.',
        ],
      },
    ],
    tips: ['Locked after too many wrong passwords? Tap ⋮ → Unlock on the Users page.'],
  },
  {
    id: 'sms', icon: 'sms', title: 'SMS to customers', roles: ADMIN,
    intro: 'The app can text your customers and suppliers when an order is finalized and when a payment is added, with their total, paid and due. Open More → Settings.',
    parts: [
      {
        shot: 'settings',
        steps: [
          'Send SMS to customers and suppliers — the main switch for your business.',
          'Turn SMS on for new orders — new orders start with SMS switched on.',
          'An SMS goes out only when all three are on: this business switch, the customer\'s SMS switch and the order\'s Send SMS switch.',
        ],
      },
      {
        shot: 'sms-log', title: 'SMS log (More → SMS log)',
        steps: [
          'Your SMS balance: how many SMS are left and when they expire.',
          'Show all messages, or only Pending, Sent, Failed or Skipped ones.',
          'Every message with its text and status. A failed or skipped one has a Retry button.',
        ],
      },
    ],
    tips: [
      'Each message uses SMS from your SMS balance — a long message uses 2 or more. With none left, messages are kept as Skipped; press Retry on them once you have SMS again.',
    ],
  },
  {
    id: 'sms-buy', icon: 'add_shopping_cart', title: 'Buy SMS', roles: ADMIN, webOnly: true,
    intro: 'SMS are bought in advance on the Billing page (More → Billing) and paid with bKash. You can buy them on their own at any time, or together with your package.',
    parts: [
      {
        shot: 'sms-balance', title: 'Your SMS balance',
        steps: [
          'How many SMS you have left and when they expire.',
          'Buy SMS.',
          'Your price per SMS and how long a pack lasts. A long message uses 2 or more SMS.',
          'SMS packs — every pack you bought or were given, with how many are left in each.',
        ],
      },
      {
        shot: 'buy-sms', title: 'Buy SMS only',
        steps: [
          'How many SMS — tap a number…',
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
  {
    id: 'billing', icon: 'credit_card', title: 'Your subscription', roles: ADMIN, webOnly: true,
    intro: 'Open Billing (More → Billing) to see your package and pay. New businesses start with a free trial.',
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
  {
    id: 'portal', icon: 'storefront', title: 'For customers and suppliers', roles: ['USER'],
    intro: 'If a business gave you a login, you can see your own orders, payments and dues with them — nothing else.',
    parts: [
      {
        shot: 'portal',
        steps: [
          'Your summary with this business: orders, total, paid and due.',
          'Your orders. Tap one to see its products and payments, and to download the invoice.',
          'Orders and Dues in the bottom bar.',
        ],
      },
    ],
  },
  {
    id: 'account', icon: 'person', title: 'Your account',
    intro: 'Open More → My profile.',
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
  {
    id: 'faq', icon: 'help', title: 'Questions and answers',
    parts: [],
    faq: [
      { q: 'I saved an order but the stock did not change.', a: 'Saved orders are drafts. Open the order and tap Finalize — then the stock changes.' },
      { q: 'I tapped Save draft but nothing happened.', a: 'Something is missing. Look for the red box and read the message under the order, for example "Choose the customer." Fill it in and tap Save draft again.' },
      { q: 'I made a mistake in a finalized order.', a: 'Remove its payments, then tap ⋮ → Void order (the stock is returned). Make a new, correct order.' },
      { q: 'My customer did not get an SMS.', a: 'Check the three SMS switches: business (More → Settings), customer, and the order. Check the mobile number and your SMS balance. More → SMS log shows the status of every message.' },
      { q: 'How many SMS do I have left?', a: 'More → SMS log shows your SMS balance and when it expires. A long message uses 2 or more SMS.' },
      { q: 'I forgot my password.', a: 'Tap "Forgot password?" on the log-in page, or ask your admin to set a new one on the Users page.' },
      { q: 'How do I add my staff?', a: 'Share your business code. They choose Join a business when they create an account; then give them a role on the Users page.' },
      { q: 'Can I use it on my phone and on a computer?', a: 'Yes. Install the Android app or open tasifmatrix.com.bd, and log in with the same email and password.' },
      { q: 'How do I sell by box and by piece?', a: 'Set the product\'s unit to BOX and say how many pieces one box holds. On each order line choose BOX or pieces.' },
      { q: 'Can I enter an order for another day?', a: 'Yes. Change the order date when you make the order — earlier or later dates are both allowed. A payment cannot be dated before its order.' },
      { q: 'How do I print on a POS (receipt) printer?', a: 'On a computer: open the order, click Print → POS receipt, choose 80 mm or 58 mm paper and click Print receipt. In the print window choose your receipt printer, Margins None and Scale 100%.' },
      { q: 'Is my business data private?', a: 'Yes. Each business sees only its own data, and the connection is encrypted. You can delete your account at any time from My profile.' },
    ],
  },
];

// =====================================================================================
// বাংলা
// =====================================================================================
const BN: GuideSection[] = [
  {
    id: 'start', icon: 'rocket_launch', title: 'শুরু করা',
    intro: 'অ্যাপটি ফোনে (অ্যান্ড্রয়েড অ্যাপ) বা কম্পিউটারে (ওয়েবসাইট) ব্যবহার করুন। দুই জায়গায় একই অ্যাকাউন্ট, একই তথ্য।',
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
          'ব্যবসার নাম লিখুন। নিচের ব্যবসার কোড নিজে থেকেই পূরণ হয় — আপনার কর্মীরা এই কোড দিয়ে যোগ দেবেন।',
          'ব্যবসার আকার বেছে নিন।',
          'আপনার নিজের তথ্য দিন: পূর্ণ নাম, ইমেইল ও মোবাইল নম্বর।',
          'নিচে স্ক্রল করে একটি পাসওয়ার্ড দিন (কমপক্ষে ৮ অক্ষর, একটি অক্ষর ও একটি সংখ্যা সহ) এবং "ব্যবসার অ্যাকাউন্ট তৈরি করুন" চাপুন। সঙ্গে সঙ্গে আপনি লগ ইন হয়ে যাবেন।',
        ],
      },
      {
        shot: 'register-join', title: 'ব্যবসায় যোগ দিন (কর্মী)',
        steps: [
          'অ্যাডমিনের দেওয়া ব্যবসার কোড লিখুন।',
          'পূর্ণ নাম, ইমেইল, মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে "অ্যাকাউন্ট তৈরি করুন" চাপুন।',
          'নতুন সদস্যরা শুরুতে শুধু দেখতে পারেন। অ্যাডমিনকে আপনার ভূমিকা ঠিক করে দিতে বলুন ("আপনার দল ও ভূমিকা" দেখুন)।',
        ],
      },
      {
        shot: 'login', title: 'লগ ইন',
        steps: [
          'আপনার ইমেইল ঠিকানা।',
          'আপনার পাসওয়ার্ড। চোখের চিহ্নে চাপলে লেখা পাসওয়ার্ড দেখা যায়।',
          '"লগ ইন" চাপুন।',
          'পাসওয়ার্ড ভুলে গেছেন? এখানে চাপুন — নতুন পাসওয়ার্ড দেওয়ার লিংক আপনার ইমেইলে যাবে।',
          'এখনও অ্যাকাউন্ট নেই? "অ্যাকাউন্ট খুলুন" চাপুন।',
        ],
      },
    ],
    tips: [
      'English বা বাংলা: লগ ইন পাতার উপরের ভাষা বোতাম চাপুন, অথবা পরে আরও → ভাষা থেকে বদলান।',
      'কম্পিউটারে যেকোনো ব্রাউজারে tasifmatrix.com.bd খুলুন এবং একই ইমেইল ও পাসওয়ার্ড দিয়ে লগ ইন করুন।',
    ],
  },
  {
    id: 'home', icon: 'dashboard', title: 'হোম স্ক্রিন ও মেনু', roles: STAFF,
    parts: [
      {
        shot: 'dashboard',
        steps: [
          'নতুন বিক্রয় — সঙ্গে সঙ্গে বিক্রয় অর্ডার শুরু করুন।',
          'নতুন ক্রয় — কেনা মাল লিখে রাখুন (অ্যাডমিন)।',
          'এক নজরে ব্যবসা: আজকের বিক্রয়, এই মাসের বিক্রয় ও ক্রয়, গ্রাহকের কাছে পাওনা, সরবরাহকারীর দেনা এবং চূড়ান্ত করার অপেক্ষায় থাকা খসড়া। যেকোনো ঘরে চাপলে তার তালিকা খোলে।',
          'নিচের বার: হোম, বিক্রয়, ক্রয় ও স্টক।',
          'আরও — বাকি সব পাতা: গ্রাহক, পণ্য, রিপোর্ট, সেটিংস এবং এই নির্দেশিকা।',
        ],
      },
      {
        shot: 'more', title: '"আরও" মেনু',
        steps: [
          'ব্যবহার নির্দেশিকা — যেকোনো সময় এই নির্দেশিকা খুলুন।',
          'ভাষা — পুরো অ্যাপ English বা বাংলায় বদলান।',
          'থিম — লাইট বা ডার্ক মোড।',
          'আমার প্রোফাইল — আপনার তথ্য, পাসওয়ার্ড ও অ্যাকাউন্ট।',
        ],
      },
    ],
    tips: ['কম্পিউটারে নিচের বারের বদলে পুরো মেনু স্ক্রিনের বাঁ পাশে থাকে।'],
  },
  {
    id: 'company', icon: 'apartment', title: 'আপনার কোম্পানির তথ্য', roles: ADMIN,
    intro: 'নিবন্ধনের সময় আপনার কোম্পানি তৈরি হয়, এবং প্রতিটি অর্ডার নিজে থেকেই এর অধীনে যায়। এর নাম, ঠিকানা ও ফোন প্রতিটি ইনভয়েস, রসিদ ও রিপোর্টে ছাপা হয়, তাই এগুলো ঠিক রাখুন। আরও → কোম্পানি খুলে আপনার কোম্পানির পাশে ⋮ চাপুন এবং "সম্পাদনা" বেছে নিন।',
    parts: [
      {
        shot: 'company-form',
        steps: [
          'কোম্পানির নাম — ইনভয়েসে যেভাবে দেখাতে চান ঠিক সেভাবে।',
          'ছোট একটি কোম্পানি কোড, যেমন SE।',
          'ঠিকানা ও শহর।',
          'গ্রাহকদের জন্য ফোন নম্বর। তারপর "সংরক্ষণ" চাপুন।',
        ],
      },
    ],
  },
  {
    id: 'products', icon: 'category', title: 'পণ্য', roles: STAFF,
    intro: 'অর্ডার তৈরির আগে, যা কেনেন বা বিক্রি করেন তার প্রতিটি পণ্য যোগ করুন। আরও → পণ্য খুলে + বোতাম চাপুন।',
    parts: [
      {
        shot: 'product-form',
        steps: [
          'পণ্যের নাম এবং চেনার মতো একটি কোড, যেমন SOAP-01।',
          'একক: পিস, কেজি, লিটার বা বক্স। স্টক এই এককে গোনা হয়।',
          'বক্স হলে: এক বক্সে কী থাকে — যেমন প্রতি বক্সে ১২ পিস। তখন বক্স হিসেবে বা পিস হিসেবে দুইভাবেই বিক্রি করা যায়।',
          'প্রতি এককের ক্রয়মূল্য (প্রতি পিস, কেজি বা লিটার)।',
          'প্রতি এককের বিক্রয়মূল্য। অর্ডারে দুটো দাম নিজে থেকে বসে যায়; প্রতিটি অর্ডারে চাইলে বদলাতে পারেন। নিচে স্ক্রল করে কম স্টক সতর্কতা দিন (ঐচ্ছিক), তারপর "সংরক্ষণ" চাপুন।',
        ],
      },
    ],
    tips: ['দাম সবসময় প্রতি পিস, কেজি বা লিটারে। বক্সের দাম অ্যাপ নিজেই হিসাব করে।'],
  },
  {
    id: 'parties', icon: 'groups', title: 'গ্রাহক ও সরবরাহকারী', roles: STAFF,
    intro: 'আরও → গ্রাহক (বা সরবরাহকারী) খুলে + বোতাম চাপুন। প্রত্যেকের জন্য ১০০০০১-এর মতো একটি কোড নিজে থেকে তৈরি হয়।',
    parts: [
      {
        shot: 'customer-form',
        steps: [
          'গ্রাহক বা দোকানের নাম।',
          'মোবাইল নম্বর। অর্ডার ও পেমেন্টের SMS এই নম্বরে যায়।',
          'শহর ও ঠিকানা (ঐচ্ছিক, ইনভয়েসে ছাপা হয়)।',
          'নিচে স্ক্রল করুন: SMS সুইচ শুরুতে চালু থাকে। যে গ্রাহক SMS পাবেন না, তার জন্য বন্ধ করুন। তারপর "সংরক্ষণ" চাপুন।',
        ],
      },
    ],
    tips: ['সরবরাহকারী একইভাবে আরও → সরবরাহকারী থেকে যোগ করুন (অ্যাডমিন)।'],
  },
  {
    id: 'sales', icon: 'point_of_sale', title: 'বিক্রয় অর্ডার তৈরি', roles: STAFF,
    intro: 'বিক্রয়ের তিনটি ধাপ: ১) অর্ডার তৈরি করে "খসড়া সংরক্ষণ", ২) "চূড়ান্ত করুন" — স্টক বের হয়ে যায়, ৩) পেমেন্ট যোগ করা। খসড়া স্টক বদলায় না, তাই যতবার খুশি ঠিক করতে পারেন।',
    parts: [
      {
        shot: 'sales-list', title: 'ধাপ ১ — বিক্রয় খুলুন',
        steps: [
          'নতুন বিক্রয় অর্ডার শুরু করতে + বোতাম চাপুন। (হোম স্ক্রিনের "নতুন বিক্রয়"-ও একই কাজ করে।)',
          'অর্ডার নম্বর বা গ্রাহক দিয়ে খুঁজুন।',
          'সব অর্ডার, অথবা শুধু খসড়া, চূড়ান্ত বা বাতিল অর্ডার দেখুন।',
          'প্রতিটি অর্ডারের মোট, পরিশোধিত ও বাকি। অর্ডারে চাপলে খোলে।',
        ],
      },
      {
        shot: 'sales-new', title: 'ধাপ ২ — গ্রাহক ও পেমেন্ট',
        steps: [
          'গ্রাহক — চেপে নাম, কোড বা মোবাইল নম্বরের কিছু অংশ লিখুন, তারপর তালিকা থেকে বেছে নিন।',
          'পেমেন্টের ধরন: নগদ, বাকি (পরে পরিশোধ) বা কিস্তি।',
          'অর্ডারের তারিখ — শুরুতে আজকের তারিখ। আগের বা পরের তারিখও বেছে নিতে পারেন।',
          'নোট (ঐচ্ছিক), যেমন ডেলিভারির সময়। এটি ইনভয়েসে ছাপা হয়।',
          'গ্রাহককে SMS পাঠান — চালু থাকলে অর্ডার চূড়ান্ত হলে এবং প্রতিটি পেমেন্টে গ্রাহক SMS পান।',
        ],
      },
      {
        shot: 'sales-product', title: 'ধাপ ৩ — পণ্য বেছে নিন',
        steps: [
          'নিচে "পণ্যের তালিকা" পর্যন্ত স্ক্রল করুন। "পণ্য" ঘরে পণ্যের নাম বা কোডের কিছু অংশ লিখুন।',
          'তালিকা থেকে বেছে নিন। তালিকায় আপনার স্টক ও বিক্রয়মূল্য দেখা যায়।',
        ],
      },
      {
        shot: 'sales-lines', title: 'ধাপ ৪ — পরিমাণ ও দাম',
        steps: [
          'ধরন — বক্স হিসেবে, অথবা পিস, কেজি বা লিটার হিসেবে বিক্রি।',
          'পরিমাণ — এখানে ৫ বক্স।',
          'মোট পিস ও প্রতি পিসের দাম নিজে থেকে বসে যায়।',
          'প্রতি বক্সের দাম — নিজে থেকে হিসাব হয়। ছাড় দিলে যেকোনো দাম বদলান।',
          'লাইনের মোট — নিজেই বদলায়।',
          'লাইন যোগ করুন — পরের পণ্যের জন্য।',
          'অর্ডারের মোট। "খসড়া সংরক্ষণ" চাপুন — অর্ডারটি খসড়া হিসেবে সংরক্ষণ হয়ে খুলে যাবে।',
        ],
      },
      {
        shot: 'sales-missing', title: 'কিছু বাদ পড়েছে?',
        steps: [
          'কিছু বাদ রেখে "খসড়া সংরক্ষণ" চাপলে সেই ঘরটি লাল হয়ে যায়।',
          'এই বার্তায় লেখা থাকে কী পূরণ করতে হবে, যেমন "১ নম্বর লাইনে একটি পণ্য বেছে নিন।" সেটি পূরণ করে আবার "খসড়া সংরক্ষণ" চাপুন।',
        ],
      },
      {
        shot: 'order-draft', title: 'ধাপ ৫ — চূড়ান্ত করুন',
        steps: [
          'চূড়ান্ত করুন — মাল বিক্রি হলে অর্ডারটি নিশ্চিত করুন।',
          'সম্পাদনা — চূড়ান্ত করার আগে খসড়া যতবার খুশি বদলান।',
          '⋮ — আরও কাজ, যেমন খসড়া মুছে ফেলা।',
        ],
      },
      {
        shot: 'finalize-confirm', title: 'নিশ্চিত করুন',
        steps: [
          'কী হবে তা অ্যাপ জানিয়ে দেয়: স্টক বের হবে, অর্ডারটি আর সম্পাদনা করা যাবে না, এবং কে SMS পাবেন।',
          '"চূড়ান্ত করুন" চাপুন। এখন পেমেন্ট যোগ করতে ও ইনভয়েস শেয়ার করতে পারবেন (পরের অধ্যায়গুলো দেখুন)।',
        ],
      },
    ],
    tips: [
      'স্টকের বেশি বিক্রি করা যায় না — লাইনে "পর্যাপ্ত স্টক নেই" দেখায় এবং অর্ডার চূড়ান্ত করা যায় না।',
      'একই পণ্য বক্স ও পিস দুইভাবে বিক্রি করবেন? দুটি লাইনে যোগ করুন: একটিতে বক্স, অন্যটিতে পিস।',
    ],
  },
  {
    id: 'purchase', icon: 'shopping_cart', title: 'ক্রয় অর্ডার তৈরি', roles: ADMIN,
    intro: 'ক্রয় অর্ডারে সরবরাহকারীর কাছ থেকে কেনা মাল লেখা হয়। চূড়ান্ত করলে স্টক বাড়ে। হোম স্ক্রিনে "নতুন ক্রয়" চাপুন, অথবা ক্রয় → + ।',
    parts: [
      {
        shot: 'purchase-new', title: 'সরবরাহকারী ও পেমেন্ট',
        steps: [
          'সরবরাহকারী — নামের কিছু অংশ লিখে তালিকা থেকে বেছে নিন।',
          'পেমেন্টের ধরন: নগদ, বাকি (পরে দেবেন) বা কিস্তি।',
          'অর্ডারের তারিখ — শুরুতে আজকের তারিখ।',
          'নোট (ঐচ্ছিক), যেমন সরবরাহকারীর ইনভয়েস নম্বর।',
          'সরবরাহকারীকে SMS পাঠান — আপনি চালু না করলে বন্ধ থাকে।',
        ],
      },
      {
        shot: 'purchase-lines', title: 'পণ্য',
        steps: [
          'পণ্য — নামের কিছু অংশ লিখে বেছে নিন।',
          'ধরন ও পরিমাণ — এখানে ২০ বক্স।',
          'ক্রয়মূল্য পণ্য থেকে নিজে বসে যায়। সরবরাহকারী অন্য দাম নিলে বদলান; লাইনের মোট নিজেই বদলাবে।',
          'অর্ডারের মোট। "খসড়া সংরক্ষণ" চাপুন। আরও পণ্য কিনলে আগে "লাইন যোগ করুন" চাপুন।',
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
    tips: ['সরবরাহকারীকে টাকা দিয়েছেন? চূড়ান্ত ক্রয় অর্ডারটি খুলে "পেমেন্ট যোগ করুন" চাপুন, বিক্রয়ের মতোই।'],
  },
  {
    id: 'finalize', icon: 'task_alt', title: 'পেমেন্ট ও ইনভয়েস', roles: STAFF,
    intro: 'অর্ডার চূড়ান্ত হওয়ার পর এতে প্রতিটি পেমেন্ট লিখুন এবং ইনভয়েস শেয়ার করুন।',
    parts: [
      {
        shot: 'order-final', title: 'চূড়ান্ত অর্ডার',
        steps: [
          'পেমেন্ট যোগ করুন — পাওয়া টাকা (বা সরবরাহকারীকে দেওয়া টাকা) লিখুন। বোতামে কত বাকি আছে দেখায়।',
          'এই অর্ডারের SMS সুইচ।',
          'অর্ডারের তথ্য: গ্রাহক, অর্ডারের তারিখ, পেমেন্টের ধরন, মোট, পরিশোধিত ও বাকি।',
          '⋮ — ইনভয়েস PDF হিসেবে খুলুন বা ডাউনলোড করুন এবং শেয়ার করুন (WhatsApp, ইমেইল)। "অর্ডার বাতিল করুন" চূড়ান্ত অর্ডার বাতিল করে স্টক ফেরত দেয় (আগে পেমেন্টগুলো সরান)।',
        ],
      },
      {
        shot: 'payment-dialog', title: 'পেমেন্ট যোগ করা',
        steps: [
          'পাওয়া টাকার পরিমাণ।',
          'পদ্ধতি: নগদ, ব্যাংক, মোবাইল ব্যাংকিং (বিকাশ, নগদ), চেক বা অন্যান্য।',
          'পেমেন্টের তারিখ।',
          'পুরো বাকি পরিশোধ — বাকি পুরো টাকা নিজে থেকে বসিয়ে দেয়।',
          'নোট, যেমন বিকাশের ট্রানজেকশন আইডি। তারপর "পেমেন্ট যোগ করুন" চাপুন।',
        ],
      },
    ],
    tips: [
      'গ্রাহক কিস্তিতে দেন? প্রতিবার একটি করে পেমেন্ট যোগ করুন; বাকি কমতে থাকবে এবং সব পেমেন্ট ইতিহাসে দেখা যাবে।',
      'বাকির রিপোর্টে যেসব অর্ডারে এখনও টাকা বাকি, সবগুলো দেখা যায়।',
      'POS (থার্মাল) প্রিন্টারে ছোট রসিদ প্রিন্ট করা হয় কম্পিউটার থেকে — ডেস্কটপ নির্দেশিকা দেখুন।',
    ],
  },
  {
    id: 'stock', icon: 'inventory', title: 'স্টক', roles: STAFF,
    intro: 'স্টক বদলায় শুধু অর্ডার চূড়ান্ত বা বাতিল হলে, অথবা অ্যাডমিন সমন্বয় পোস্ট করলে। নিচের বার থেকে "স্টক" খুলুন।',
    parts: [
      {
        shot: 'stock-balance', title: 'স্টক ব্যালেন্স',
        steps: [
          'পণ্য খুঁজুন।',
          'শুধু কম স্টক — সতর্কতার সীমার নিচের পণ্যগুলো দেখায়।',
          'লাল "কম স্টক" চিহ্ন মানে আবার কেনার সময় হয়েছে।',
          'স্টক সমন্বয় (অ্যাডমিন) — প্রারম্ভিক স্টক, নষ্ট, হারানো ও সংশোধনের জন্য।',
        ],
      },
      {
        shot: 'stock-adjust', title: 'স্টক সমন্বয়',
        steps: [
          'পণ্য — নিচে বর্তমান স্টক দেখায়।',
          'বৃদ্ধি বা হ্রাস।',
          'পরিমাণ।',
          'কারণ: প্রারম্ভিক স্টক, নষ্ট, হারানো, সংশোধন বা অন্যান্য।',
          'নোট (ঐচ্ছিক)। তারপর "সমন্বয় পোস্ট করুন" চাপুন।',
        ],
      },
    ],
    tips: [
      'নতুন শুরু করছেন? প্রতিটি পণ্যের জন্য "প্রারম্ভিক স্টক" সমন্বয় পোস্ট করুন, যাতে অ্যাপ জানে আপনার কাছে কী আছে।',
      'সমন্বয় সম্পাদনা করা যায় না। ভুল হলে উল্টো একটি সমন্বয় পোস্ট করুন।',
      'স্টক লেজার (আরও → স্টক লেজার) প্রতিটি আসা-যাওয়া এবং তারপরের ব্যালেন্স দেখায়।',
    ],
  },
  {
    id: 'reports', icon: 'bar_chart', title: 'রিপোর্ট ও বাকি', roles: STAFF,
    intro: 'রিপোর্টে শুধু চূড়ান্ত অর্ডার গোনা হয়। প্রতিটি রিপোর্ট PDF হিসেবে প্রিন্ট বা শেয়ার করা যায়।',
    parts: [
      {
        shot: 'due-report', title: 'বাকির রিপোর্ট',
        steps: [
          'গ্রাহকের বাকি (আপনার পাওনা) বা সরবরাহকারীর পাওনা (আপনার দেনা)।',
          'অর্ডারের তারিখ — একটি সময়সীমা বেছে নিন।',
          'রিপোর্টটি PDF হিসেবে প্রিন্ট / শেয়ার করুন।',
          'প্রতিটি অপরিশোধিত অর্ডার এবং কত দিন ধরে বাকি। চাপলে অর্ডার খোলে, সেখান থেকে পেমেন্ট যোগ করুন।',
        ],
      },
      {
        shot: 'customer-report', title: 'গ্রাহক রিপোর্ট',
        steps: [
          'মোট: অর্ডারের সংখ্যা, অর্ডারের মোট, পরিশোধিত ও বাকি।',
          'গ্রাহক খুঁজুন, সময়সীমা বেছে নিন বা শুধু বাকি আছে এমন গ্রাহক দেখুন।',
          'প্রতি গ্রাহকের একটি কার্ড। চাপলে ওই গ্রাহকের অর্ডারগুলো খোলে — সেখান থেকে "প্রিন্ট / শেয়ার" দিয়ে সেগুলো প্রিন্ট করুন।',
          'পুরো রিপোর্ট প্রিন্ট / শেয়ার করুন।',
        ],
      },
    ],
    tips: ['সরবরাহকারী রিপোর্ট ও কোম্পানি রিপোর্ট ("আরও" মেনু) একইভাবে কাজ করে।'],
  },
  {
    id: 'team', icon: 'manage_accounts', title: 'আপনার দল ও ভূমিকা', roles: ADMIN,
    parts: [
      {
        shot: 'invite', title: 'কর্মীদের আমন্ত্রণ',
        steps: [
          'আপনার ব্যবসার কোড। কর্মীরা "অ্যাকাউন্ট খুলুন → একটি ব্যবসায় যোগ দিন" বেছে এই কোড লিখবেন।',
          'কোড কপি করুন, অথবা নিবন্ধন লিংক কপি করে WhatsApp-এ পাঠান। (এই কার্ড আরও → সেটিংসেও পাবেন।)',
        ],
      },
      {
        shot: 'user-form', title: 'প্রত্যেককে ভূমিকা দিন',
        steps: [
          'ভূমিকা: অ্যাডমিন (সবকিছু), ম্যানেজার (বিক্রয়, গ্রাহক ও স্টক) বা ব্যবহারকারী (শুধু দেখা)।',
          'যে গ্রাহক বা সরবরাহকারী লগ ইন করবেন: তার ব্যবহারকারী অ্যাকাউন্ট তার সাথে সংযুক্ত করুন, যাতে তিনি শুধু নিজের অর্ডার ও বাকি দেখেন।',
          'আরও → ব্যবহারকারী খুলে কারও পাশে ⋮ চাপুন, তারপর "সম্পাদনা"। কেউ পাসওয়ার্ড ভুলে গেলে এখানে নতুন পাসওয়ার্ড দিন — পরের লগ ইনে তাকে সেটি বদলাতে হবে। তারপর "সংরক্ষণ" চাপুন।',
        ],
      },
    ],
    tips: ['বারবার ভুল পাসওয়ার্ডে লক হয়ে গেছে? ব্যবহারকারী পাতায় ⋮ → আনলক চাপুন।'],
  },
  {
    id: 'sms', icon: 'sms', title: 'গ্রাহকদের SMS', roles: ADMIN,
    intro: 'অর্ডার চূড়ান্ত হলে এবং পেমেন্ট যোগ হলে অ্যাপ গ্রাহক ও সরবরাহকারীকে মোট, পরিশোধিত ও বাকিসহ SMS পাঠাতে পারে। আরও → সেটিংস খুলুন।',
    parts: [
      {
        shot: 'settings',
        steps: [
          'গ্রাহক ও সরবরাহকারীকে SMS পাঠান — আপনার ব্যবসার মূল সুইচ।',
          'নতুন অর্ডারে SMS চালু রাখুন — নতুন অর্ডার SMS চালু অবস্থায় শুরু হবে।',
          'SMS যায় শুধু তিনটিই চালু থাকলে: ব্যবসার এই সুইচ, গ্রাহকের SMS সুইচ এবং অর্ডারের "SMS পাঠান" সুইচ।',
        ],
      },
      {
        shot: 'sms-log', title: 'SMS লগ (আরও → SMS লগ)',
        steps: [
          'আপনার SMS ব্যালেন্স: কতটি SMS বাকি আছে এবং কবে মেয়াদ শেষ হবে।',
          'সব বার্তা, অথবা শুধু অপেক্ষমাণ, পাঠানো হয়েছে, ব্যর্থ বা বাদ পড়েছে এমন বার্তা দেখুন।',
          'প্রতিটি বার্তা, তার লেখা ও অবস্থা। ব্যর্থ বা বাদ পড়া বার্তায় "আবার চেষ্টা" বোতাম থাকে।',
        ],
      },
    ],
    tips: [
      'প্রতিটি বার্তা আপনার SMS ব্যালেন্স থেকে SMS নেয় — বড় বার্তায় ২ বা তার বেশি লাগে। SMS না থাকলে বার্তাগুলো "বাদ পড়েছে" হিসেবে থাকে; আবার SMS পেলে সেগুলোতে "আবার চেষ্টা" চাপুন।',
    ],
  },
  {
    id: 'sms-buy', icon: 'add_shopping_cart', title: 'SMS কেনা', roles: ADMIN, webOnly: true,
    intro: 'SMS আগে থেকে কিনতে হয় বিলিং পাতায় (আরও → বিলিং), টাকা দেওয়া যায় বিকাশে। যেকোনো সময় শুধু SMS কিনতে পারেন, অথবা প্যাকেজের সাথে একসাথে।',
    parts: [
      {
        shot: 'sms-balance', title: 'আপনার SMS ব্যালেন্স',
        steps: [
          'কতটি SMS বাকি আছে এবং কবে মেয়াদ শেষ হবে।',
          'SMS কিনুন।',
          'প্রতি SMS-এর দাম এবং একটি প্যাক কতদিন চলে। বড় বার্তায় ২ বা তার বেশি SMS লাগে।',
          'SMS প্যাক — আপনার কেনা বা পাওয়া প্রতিটি প্যাক, এবং প্রতিটিতে কতটি বাকি।',
        ],
      },
      {
        shot: 'buy-sms', title: 'শুধু SMS কেনা',
        steps: [
          'কতটি SMS — একটি সংখ্যায় চাপুন…',
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
  {
    id: 'billing', icon: 'credit_card', title: 'আপনার সাবস্ক্রিপশন', roles: ADMIN, webOnly: true,
    intro: '"বিলিং" (আরও → বিলিং) খুলে আপনার প্যাকেজ দেখুন ও পরিশোধ করুন। নতুন ব্যবসা বিনামূল্যে ট্রায়াল দিয়ে শুরু করে।',
    parts: [
      {
        shot: 'billing',
        steps: [
          'আপনার ব্যবসার আকার অনুযায়ী প্যাকেজ — মাসিক, ৩ মাস ও আরও বেশি। আগে পরিশোধ করলে একদিনও নষ্ট হয় না: সময়টি বর্তমান মেয়াদ শেষের পরে যোগ হয়।',
          'বিকাশে পরিশোধ করুন। পরিশোধের পর বিলিং পাতায় ফিরে নতুন মেয়াদ দেখতে পাবেন। প্রতিটি পেমেন্ট "পেমেন্টের ইতিহাস"-এ থাকে।',
        ],
      },
    ],
  },
  {
    id: 'portal', icon: 'storefront', title: 'গ্রাহক ও সরবরাহকারীদের জন্য', roles: ['USER'],
    intro: 'কোনো ব্যবসা আপনাকে লগ ইন দিলে, তাদের সাথে আপনার নিজের অর্ডার, পেমেন্ট ও বাকি দেখতে পারবেন — অন্য কিছু নয়।',
    parts: [
      {
        shot: 'portal',
        steps: [
          'এই ব্যবসার সাথে আপনার সারাংশ: অর্ডার, মোট, পরিশোধিত ও বাকি।',
          'আপনার অর্ডারগুলো। একটিতে চাপলে পণ্য ও পেমেন্ট দেখা যায় এবং ইনভয়েস ডাউনলোড করা যায়।',
          'নিচের বারে অর্ডার ও বাকি।',
        ],
      },
    ],
  },
  {
    id: 'account', icon: 'person', title: 'আপনার অ্যাকাউন্ট',
    intro: 'আরও → আমার প্রোফাইল খুলুন।',
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
  {
    id: 'faq', icon: 'help', title: 'প্রশ্ন ও উত্তর',
    parts: [],
    faq: [
      { q: 'অর্ডার সংরক্ষণ করলাম, কিন্তু স্টক বদলায়নি।', a: 'সংরক্ষিত অর্ডার খসড়া থাকে। অর্ডারটি খুলে "চূড়ান্ত করুন" চাপুন — তখন স্টক বদলাবে।' },
      { q: '"খসড়া সংরক্ষণ" চাপলাম, কিন্তু কিছু হলো না।', a: 'কিছু বাদ পড়েছে। লাল ঘরটি খুঁজুন এবং অর্ডারের নিচের বার্তাটি পড়ুন, যেমন "গ্রাহক বেছে নিন।" সেটি পূরণ করে আবার "খসড়া সংরক্ষণ" চাপুন।' },
      { q: 'চূড়ান্ত অর্ডারে ভুল হয়ে গেছে।', a: 'আগে এর পেমেন্টগুলো সরান, তারপর ⋮ → অর্ডার বাতিল করুন চাপুন (স্টক ফেরত আসে)। এরপর সঠিক একটি নতুন অর্ডার তৈরি করুন।' },
      { q: 'আমার গ্রাহক SMS পাননি।', a: 'তিনটি SMS সুইচ দেখুন: ব্যবসা (আরও → সেটিংস), গ্রাহক এবং অর্ডার। মোবাইল নম্বর ও আপনার SMS ব্যালেন্স দেখুন। আরও → SMS লগে প্রতিটি বার্তার অবস্থা দেখা যায়।' },
      { q: 'আমার আর কতটি SMS বাকি আছে?', a: 'আরও → SMS লগে আপনার SMS ব্যালেন্স এবং মেয়াদ শেষের তারিখ দেখা যায়। বড় বার্তায় ২ বা তার বেশি SMS লাগে।' },
      { q: 'পাসওয়ার্ড ভুলে গেছি।', a: 'লগ ইন পাতায় "পাসওয়ার্ড ভুলে গেছেন?" চাপুন, অথবা অ্যাডমিনকে ব্যবহারকারী পাতা থেকে নতুন পাসওয়ার্ড দিতে বলুন।' },
      { q: 'কর্মীদের কীভাবে যোগ করব?', a: 'আপনার ব্যবসার কোড দিন। অ্যাকাউন্ট খোলার সময় তারা "একটি ব্যবসায় যোগ দিন" বেছে নেবেন; তারপর ব্যবহারকারী পাতা থেকে তাদের ভূমিকা দিন।' },
      { q: 'ফোন ও কম্পিউটার দুটোতেই চালানো যাবে?', a: 'হ্যাঁ। অ্যান্ড্রয়েড অ্যাপ ইনস্টল করুন বা tasifmatrix.com.bd খুলুন, এবং একই ইমেইল ও পাসওয়ার্ড দিয়ে লগ ইন করুন।' },
      { q: 'বক্স ও পিস দুইভাবে কীভাবে বিক্রি করব?', a: 'পণ্যের একক "বক্স" দিন এবং এক বক্সে কত পিস তা লিখুন। প্রতিটি অর্ডার লাইনে বক্স বা পিস বেছে নিন।' },
      { q: 'অন্য দিনের অর্ডার কি লেখা যায়?', a: 'হ্যাঁ। অর্ডার তৈরির সময় তারিখ বদলে দিন — আগের বা পরের দুই রকম তারিখই দেওয়া যায়। তবে পেমেন্টের তারিখ অর্ডারের তারিখের আগে হতে পারে না।' },
      { q: 'POS (রসিদ) প্রিন্টারে কীভাবে প্রিন্ট করব?', a: 'কম্পিউটারে: অর্ডারটি খুলুন, প্রিন্ট → POS রসিদ চাপুন, 80 mm বা 58 mm কাগজ বেছে নিয়ে "রসিদ প্রিন্ট করুন" চাপুন। প্রিন্ট উইন্ডোতে আপনার রসিদ প্রিন্টার বেছে নিন, Margins None ও Scale 100% দিন।' },
      { q: 'আমার ব্যবসার তথ্য কি গোপন থাকে?', a: 'হ্যাঁ। প্রতিটি ব্যবসা শুধু নিজের তথ্য দেখে, এবং সংযোগ এনক্রিপ্টেড। আমার প্রোফাইল থেকে যেকোনো সময় অ্যাকাউন্ট মুছে ফেলতে পারেন।' },
    ],
  },
];


export const GUIDE: Record<GuideLang, { text: GuideText; sections: GuideSection[]; desktop: Record<string, GuideDesktop> }> = {
  en: {
    text: {
      title: 'User guide',
      subtitle: 'Step-by-step help with pictures. The numbers on each picture match the numbered steps. Tap or click a picture to see it larger.',
      contents: 'Contents', section: 'Section', enlarge: 'Enlarge picture',
      mobile: 'Mobile', desktop: 'Desktop', device: 'Guide for',
    },
    sections: EN,
    desktop: DESKTOP.en,
  },
  bn: {
    text: {
      title: 'ব্যবহার নির্দেশিকা',
      subtitle: 'ছবিসহ ধাপে ধাপে সহায়তা। প্রতিটি ছবির নম্বর ধাপগুলোর নম্বরের সাথে মিলে যায়। ছবিতে চাপলে বা ক্লিক করলে বড় করে দেখা যায়।',
      contents: 'সূচিপত্র', section: 'অধ্যায়', enlarge: 'ছবি বড় করুন',
      mobile: 'মোবাইল', desktop: 'ডেস্কটপ', device: 'নির্দেশিকা',
    },
    sections: BN,
    desktop: DESKTOP.bn,
  },
};
