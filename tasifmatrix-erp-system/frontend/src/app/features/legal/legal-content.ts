/**
 * Text of the public privacy policy and account deletion pages, in English and Bangla.
 * Kept as whole documents rather than translation keys: a policy reads as one piece, and both
 * languages must say the same thing. Change both when you change one, and move LAST_UPDATED.
 */
export const LAST_UPDATED = '2026-10-07';

/** A paragraph, or a bulleted list. */
export type Block = string | { list: string[] };

export interface Section {
  heading: string;
  blocks: Block[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: Section[];
}

// ====================================================================== privacy policy

export const PRIVACY: Record<'en' | 'bn', LegalDoc> = {
  en: {
    title: 'Privacy policy',
    intro:
      'Tasif Matrix ERP is a business management app - on the website and as an Android app - made by Tasif Matrix Limited, Bangladesh ("we", "us"). It helps shops and businesses manage purchases, sales, stock and payments. This policy explains what information we collect, why, who it is shared with, and the choices you have.',
    sections: [
      {
        heading: 'Information we collect',
        blocks: [
          {
            list: [
              'Your account: your name, email address, mobile number, your role, and the business you belong to. Your password is never stored as you typed it - only as a secure one-way hash.',
              'Your business: its name and business code, a contact person, email and phone, and the company details printed on your invoices (such as address and trade licence number).',
              'Records your business enters: customers and suppliers (names, mobile numbers, addresses, and NID or TIN if you enter them), products, stock, orders, payments and invoices.',
              'Subscription payments: the package, amount, date and invoice number, and the transaction ID and wallet number that bKash sends us. We never see your bKash PIN or verification code.',
              'Security information: when you sign in, failed sign-in attempts, and server logs with your IP address and device or browser type.',
              'On your device: the app keeps you signed in and remembers your language and light or dark mode on your phone or browser.',
            ],
          },
          'We do not collect your location, contacts, photos or files, and the app has no advertising or tracking tools.',
        ],
      },
      {
        heading: 'How we use it',
        blocks: [
          {
            list: [
              'to run the app for your business and show each person what their role allows;',
              'to sign you in and keep accounts and businesses secure;',
              'to send the messages you ask for: password reset emails, invoices and reports by email, and SMS to your customers and suppliers when your business turns SMS on;',
              'to manage your subscription: free trial, reminders before it ends, and payments;',
              'to answer your questions and to tell you about news, maintenance and changes in Announcements.',
            ],
          },
          'We do not sell your information, and we do not use it for advertising.',
        ],
      },
      {
        heading: 'Who can see it',
        blocks: [
          {
            list: [
              'People in your business, according to the role their admin gives them. Other businesses using Tasif Matrix ERP cannot see your data: each business is kept separate in the database.',
              'Tasif Matrix Limited sees what it needs to run the service: your business name and contact details, usage counts and your subscription. We do not look through your business records except when you ask us to help, or when the law requires it.',
              'Service providers that work for us: Railway (servers and database), Brevo (sending emails), bKash (subscription payments), and our SMS gateway (sending SMS). They may use the information only to provide their service to us.',
              'Authorities, when Bangladeshi law requires us to share it.',
            ],
          },
        ],
      },
      {
        heading: "Your customers' and suppliers' information",
        blocks: [
          'Your business decides what it records about its customers and suppliers and is responsible for it; we store and process those records on its behalf. A customer or supplier who wants their details changed or removed should ask the business that recorded them.',
        ],
      },
      {
        heading: 'How we protect it',
        blocks: [
          'All traffic between the app and our servers is encrypted (HTTPS). Passwords are stored as one-way hashes, payment gateway keys are encrypted, every business\'s data is separated at the database level, and access to the servers is limited to the people who run the service.',
        ],
      },
      {
        heading: 'Keeping and deleting your information',
        blocks: [
          'We keep your information while your account is open. You can delete your account at any time from My profile > Delete account, in the app or on the website - see "Delete your account" for the steps and exactly what is removed.',
          {
            list: [
              'Deleting your account erases your name, email, mobile number and password, ends all your sessions, and removes your name from the records you entered. Those records belong to your business and stay with it.',
              'If you are the only admin, deleting your account closes the business: all of its records and the accounts of everyone in it are deleted.',
              'We keep the subscription payment records of a closed business (invoice number, amount, date and bKash transaction ID), and its name and code, for our accounts and for as long as the law requires.',
              'Deleted information can remain in our server backups for a short time, until those backups are replaced.',
            ],
          },
        ],
      },
      {
        heading: 'Children',
        blocks: ['Tasif Matrix ERP is made for businesses and is not meant for anyone under 18.'],
      },
      {
        heading: 'Changes to this policy',
        blocks: [
          'When we change this policy we update the date at the top of this page. If a change is important, we also tell you in the app\'s Announcements.',
        ],
      },
    ],
  },
  bn: {
    title: 'গোপনীয়তা নীতি',
    intro:
      'Tasif Matrix ERP একটি ব্যবসা পরিচালনার অ্যাপ - ওয়েবসাইটে ও অ্যান্ড্রয়েড অ্যাপে - যা তৈরি করেছে বাংলাদেশের Tasif Matrix Limited ("আমরা")। এটি দোকান ও ব্যবসাকে ক্রয়, বিক্রয়, স্টক ও পেমেন্ট পরিচালনায় সাহায্য করে। আমরা কী তথ্য সংগ্রহ করি, কেন করি, কার সাথে শেয়ার করি এবং আপনার কী কী সুযোগ আছে - এই নীতিতে তা বলা হয়েছে।',
    sections: [
      {
        heading: 'আমরা যে তথ্য সংগ্রহ করি',
        blocks: [
          {
            list: [
              'আপনার অ্যাকাউন্ট: আপনার নাম, ইমেইল, মোবাইল নম্বর, আপনার ভূমিকা এবং আপনি কোন ব্যবসার সদস্য। আপনার পাসওয়ার্ড কখনো লেখা অবস্থায় রাখা হয় না - শুধু একটি নিরাপদ একমুখী হ্যাশ হিসেবে রাখা হয়।',
              'আপনার ব্যবসা: এর নাম ও ব্যবসার কোড, একজন যোগাযোগকারী, ইমেইল ও ফোন, এবং ইনভয়েসে ছাপা কোম্পানির তথ্য (যেমন ঠিকানা ও ট্রেড লাইসেন্স নম্বর)।',
              'আপনার ব্যবসা যে রেকর্ড রাখে: গ্রাহক ও সরবরাহকারী (নাম, মোবাইল নম্বর, ঠিকানা, এবং দিলে NID বা TIN), পণ্য, স্টক, অর্ডার, পেমেন্ট ও ইনভয়েস।',
              'সাবস্ক্রিপশন পেমেন্ট: প্যাকেজ, টাকার পরিমাণ, তারিখ ও ইনভয়েস নম্বর, এবং bKash যে ট্রানজেকশন আইডি ও ওয়ালেট নম্বর পাঠায়। আপনার bKash পিন বা ভেরিফিকেশন কোড আমরা কখনো দেখি না।',
              'নিরাপত্তা তথ্য: কখন সাইন ইন করেছেন, ব্যর্থ সাইন ইনের চেষ্টা, এবং সার্ভার লগে আপনার IP ঠিকানা ও ডিভাইস বা ব্রাউজারের ধরন।',
              'আপনার ডিভাইসে: অ্যাপটি আপনাকে সাইন ইন অবস্থায় রাখে এবং আপনার ফোন বা ব্রাউজারে আপনার ভাষা ও লাইট বা ডার্ক মোড মনে রাখে।',
            ],
          },
          'আমরা আপনার লোকেশন, কন্টাক্ট, ছবি বা ফাইল সংগ্রহ করি না, এবং অ্যাপে কোনো বিজ্ঞাপন বা ট্র্যাকিং টুল নেই।',
        ],
      },
      {
        heading: 'তথ্য যেভাবে ব্যবহার করি',
        blocks: [
          {
            list: [
              'আপনার ব্যবসার জন্য অ্যাপটি চালাতে, এবং প্রত্যেককে তার ভূমিকা অনুযায়ী যা অনুমোদিত তা দেখাতে;',
              'আপনাকে সাইন ইন করাতে এবং অ্যাকাউন্ট ও ব্যবসা নিরাপদ রাখতে;',
              'আপনি যে বার্তা চান তা পাঠাতে: পাসওয়ার্ড রিসেট ইমেইল, ইমেইলে ইনভয়েস ও রিপোর্ট, এবং আপনার ব্যবসা SMS চালু করলে গ্রাহক ও সরবরাহকারীদের SMS;',
              'আপনার সাবস্ক্রিপশন পরিচালনা করতে: ফ্রি ট্রায়াল, শেষ হওয়ার আগে রিমাইন্ডার, এবং পেমেন্ট;',
              'আপনার প্রশ্নের উত্তর দিতে, এবং ঘোষণা পাতায় খবর, রক্ষণাবেক্ষণ ও পরিবর্তনের কথা জানাতে।',
            ],
          },
          'আমরা আপনার তথ্য বিক্রি করি না, এবং বিজ্ঞাপনের জন্য ব্যবহার করি না।',
        ],
      },
      {
        heading: 'কারা তথ্য দেখতে পারে',
        blocks: [
          {
            list: [
              'আপনার ব্যবসার লোকজন, তাদের অ্যাডমিন যে ভূমিকা দেন সে অনুযায়ী। Tasif Matrix ERP ব্যবহারকারী অন্য ব্যবসা আপনার তথ্য দেখতে পারে না: ডাটাবেসে প্রতিটি ব্যবসা আলাদা রাখা হয়।',
              'সেবা চালাতে Tasif Matrix Limited যা দরকার তা দেখে: আপনার ব্যবসার নাম ও যোগাযোগের তথ্য, ব্যবহারের সংখ্যা এবং আপনার সাবস্ক্রিপশন। আপনি সাহায্য না চাইলে বা আইন না চাইলে আমরা আপনার ব্যবসার রেকর্ড ঘেঁটে দেখি না।',
              'আমাদের হয়ে কাজ করা সেবাদাতা: Railway (সার্ভার ও ডাটাবেস), Brevo (ইমেইল পাঠানো), bKash (সাবস্ক্রিপশন পেমেন্ট), এবং আমাদের SMS গেটওয়ে (SMS পাঠানো)। তারা শুধু আমাদের সেবা দিতেই এই তথ্য ব্যবহার করতে পারে।',
              'বাংলাদেশের আইন অনুযায়ী প্রয়োজন হলে কর্তৃপক্ষ।',
            ],
          },
        ],
      },
      {
        heading: 'আপনার গ্রাহক ও সরবরাহকারীদের তথ্য',
        blocks: [
          'আপনার ব্যবসা তার গ্রাহক ও সরবরাহকারীদের সম্পর্কে কী রেকর্ড রাখবে তা সে-ই ঠিক করে এবং এর দায়িত্বও তার; আমরা ব্যবসার পক্ষে সেই রেকর্ড সংরক্ষণ ও প্রক্রিয়া করি। কোনো গ্রাহক বা সরবরাহকারী তার তথ্য বদলাতে বা মুছতে চাইলে যে ব্যবসা তা রেকর্ড করেছে তাদের জানাবেন।',
        ],
      },
      {
        heading: 'তথ্য যেভাবে সুরক্ষিত রাখি',
        blocks: [
          'অ্যাপ ও আমাদের সার্ভারের মধ্যে সব আদান-প্রদান এনক্রিপ্ট করা (HTTPS)। পাসওয়ার্ড একমুখী হ্যাশ হিসেবে রাখা হয়, পেমেন্ট গেটওয়ের কী এনক্রিপ্ট করা থাকে, প্রতিটি ব্যবসার তথ্য ডাটাবেস পর্যায়ে আলাদা থাকে, এবং সার্ভারে শুধু সেবা পরিচালনাকারীরাই প্রবেশ করতে পারেন।',
        ],
      },
      {
        heading: 'তথ্য রাখা ও মুছে ফেলা',
        blocks: [
          'আপনার অ্যাকাউন্ট চালু থাকা পর্যন্ত আমরা তথ্য রাখি। অ্যাপে বা ওয়েবসাইটে আমার প্রোফাইল > অ্যাকাউন্ট মুছুন থেকে যেকোনো সময় আপনার অ্যাকাউন্ট মুছতে পারেন - ধাপগুলো ও ঠিক কী মোছা হয় তা "আপনার অ্যাকাউন্ট মুছুন" পাতায় দেখুন।',
          {
            list: [
              'অ্যাকাউন্ট মুছলে আপনার নাম, ইমেইল, মোবাইল নম্বর ও পাসওয়ার্ড মুছে যায়, সব সেশন বন্ধ হয়, এবং আপনার এন্ট্রি করা রেকর্ড থেকে আপনার নাম সরানো হয়। সেই রেকর্ডগুলো আপনার ব্যবসার, তাই ব্যবসার কাছেই থাকে।',
              'আপনি একমাত্র অ্যাডমিন হলে অ্যাকাউন্ট মুছলে ব্যবসাটি বন্ধ হয়ে যায়: এর সব রেকর্ড এবং এর সবার অ্যাকাউন্ট মুছে ফেলা হয়।',
              'বন্ধ হওয়া ব্যবসার সাবস্ক্রিপশন পেমেন্টের রেকর্ড (ইনভয়েস নম্বর, টাকার পরিমাণ, তারিখ ও bKash ট্রানজেকশন আইডি), এবং এর নাম ও কোড আমাদের হিসাবের জন্য, আইন যতদিন চায় ততদিন রাখি।',
              'মুছে ফেলা তথ্য আমাদের সার্ভারের ব্যাকআপে অল্প সময় থেকে যেতে পারে, যতক্ষণ না সেই ব্যাকআপ বদলানো হয়।',
            ],
          },
        ],
      },
      {
        heading: 'শিশু',
        blocks: ['Tasif Matrix ERP ব্যবসার জন্য তৈরি এবং ১৮ বছরের কম বয়সীদের জন্য নয়।'],
      },
      {
        heading: 'এই নীতির পরিবর্তন',
        blocks: [
          'এই নীতি বদলালে আমরা এই পাতার উপরের তারিখ হালনাগাদ করি। গুরুত্বপূর্ণ পরিবর্তন হলে অ্যাপের ঘোষণা পাতাতেও জানাই।',
        ],
      },
    ],
  },
};

// ====================================================================== deleting an account

export const DELETION: Record<'en' | 'bn', LegalDoc> = {
  en: {
    title: 'Delete your Tasif Matrix ERP account',
    intro:
      'You can delete your Tasif Matrix ERP account yourself at any time, from the Android app or the website. Deletion happens straight away and cannot be undone.',
    sections: [
      {
        heading: 'How to delete it',
        blocks: [
          {
            list: [
              'In the Android app: open More > My profile, then tap Delete account.',
              'On the website: sign in, open My profile from the menu, then choose Delete account.',
              'Confirm with your password. If you are the only admin of your business, you also type your business code, because the whole business will be closed.',
            ],
          },
          'Forgot your password? Use "Forgot password?" on the sign-in page to set a new one, then delete your account. If you still cannot get in, contact us (details below).',
        ],
      },
      {
        heading: 'What is deleted',
        blocks: [
          {
            list: [
              'Your name, email address, mobile number and password.',
              'All your sign-in sessions, on every device.',
              'Your name on the records you entered (for example orders and payments).',
              'If you are the only admin: the whole business - its companies, customers, suppliers, products, stock, orders, payments, invoices and SMS, and the accounts of everyone in it.',
            ],
          },
        ],
      },
      {
        heading: 'What is kept',
        blocks: [
          {
            list: [
              'Records you entered for your business (orders, payments, stock) stay with the business, without your name, while the business uses Tasif Matrix ERP. They belong to the business.',
              'For a closed business: its name and code, and its subscription payment records (invoice number, amount, date and bKash transaction ID), kept for our accounts for as long as the law requires.',
              'Deleted information can stay in our server backups for a short time, until those backups are replaced.',
            ],
          },
        ],
      },
    ],
  },
  bn: {
    title: 'আপনার Tasif Matrix ERP অ্যাকাউন্ট মুছুন',
    intro:
      'অ্যান্ড্রয়েড অ্যাপ বা ওয়েবসাইট থেকে যেকোনো সময় আপনি নিজেই আপনার Tasif Matrix ERP অ্যাকাউন্ট মুছতে পারেন। মোছা সঙ্গে সঙ্গে হয় এবং আর ফেরানো যায় না।',
    sections: [
      {
        heading: 'কীভাবে মুছবেন',
        blocks: [
          {
            list: [
              'অ্যান্ড্রয়েড অ্যাপে: আরও > আমার প্রোফাইল খুলুন, তারপর অ্যাকাউন্ট মুছুন চাপুন।',
              'ওয়েবসাইটে: সাইন ইন করুন, মেনু থেকে আমার প্রোফাইল খুলুন, তারপর অ্যাকাউন্ট মুছুন বেছে নিন।',
              'আপনার পাসওয়ার্ড দিয়ে নিশ্চিত করুন। আপনি ব্যবসার একমাত্র অ্যাডমিন হলে আপনার ব্যবসার কোডও লিখতে হবে, কারণ পুরো ব্যবসাটি বন্ধ হয়ে যাবে।',
            ],
          },
          'পাসওয়ার্ড ভুলে গেছেন? সাইন ইন পাতায় "পাসওয়ার্ড ভুলে গেছেন?" দিয়ে নতুন পাসওয়ার্ড সেট করুন, তারপর অ্যাকাউন্ট মুছুন। তবুও ঢুকতে না পারলে আমাদের সাথে যোগাযোগ করুন (নিচে দেওয়া আছে)।',
        ],
      },
      {
        heading: 'যা মুছে ফেলা হয়',
        blocks: [
          {
            list: [
              'আপনার নাম, ইমেইল, মোবাইল নম্বর ও পাসওয়ার্ড।',
              'সব ডিভাইসে আপনার সব সাইন-ইন সেশন।',
              'আপনার এন্ট্রি করা রেকর্ডে (যেমন অর্ডার ও পেমেন্ট) আপনার নাম।',
              'আপনি একমাত্র অ্যাডমিন হলে: পুরো ব্যবসা - এর কোম্পানি, গ্রাহক, সরবরাহকারী, পণ্য, স্টক, অর্ডার, পেমেন্ট, ইনভয়েস ও SMS, এবং এর সবার অ্যাকাউন্ট।',
            ],
          },
        ],
      },
      {
        heading: 'যা রাখা হয়',
        blocks: [
          {
            list: [
              'ব্যবসার জন্য আপনার এন্ট্রি করা রেকর্ড (অর্ডার, পেমেন্ট, স্টক) আপনার নাম ছাড়া ব্যবসার কাছেই থাকে, যতদিন ব্যবসাটি Tasif Matrix ERP ব্যবহার করে। এগুলো ব্যবসার সম্পদ।',
              'বন্ধ হওয়া ব্যবসার ক্ষেত্রে: এর নাম ও কোড, এবং এর সাবস্ক্রিপশন পেমেন্টের রেকর্ড (ইনভয়েস নম্বর, টাকার পরিমাণ, তারিখ ও bKash ট্রানজেকশন আইডি), আমাদের হিসাবের জন্য আইন যতদিন চায় ততদিন রাখা হয়।',
              'মুছে ফেলা তথ্য আমাদের সার্ভারের ব্যাকআপে অল্প সময় থেকে যেতে পারে, যতক্ষণ না সেই ব্যাকআপ বদলানো হয়।',
            ],
          },
        ],
      },
    ],
  },
};
