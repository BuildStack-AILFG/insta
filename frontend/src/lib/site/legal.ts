import { SITE } from "./config";
import type { Block } from "./seo";

export type LegalDoc = { slug: string; title: string; metaDescription: string; summary: string; body: Block[] };

const CO = SITE.legalName;
const MAIL = SITE.supportEmail;
const OWNER = "SCALEDESK TECHNOLOGY PRIVATE LIMITED";

/**
 * NOTE FOR THE BUSINESS: these texts are a solid, product-accurate starting point but are not legal advice. Have a lawyer review them
 * (especially liability, governing law, refunds and the grievance officer details) before relying on them.
 */
export const LEGAL: LegalDoc[] = [
  {
    slug: "privacy",
    title: "Privacy Policy",
    metaDescription: `How ${OWNER} collects, uses, shares and protects personal data when you use DMForGrow, and your rights under India's DPDP Act, the GDPR, UK GDPR and US state privacy laws.`,
    summary: "What we collect, why, the legal basis, who we share it with, where it is stored, how long we keep it and how you can exercise your rights — in India and abroad.",
    body: [
      { type: "p", text: `${SITE.name} is a product of **${OWNER}**. This policy explains how **${OWNER}** ("**${SITE.name}**", "we", "us", "our") collects, uses, shares and protects personal data when you visit our website, create an account or use the ${SITE.name} service.` },
      { type: "p", text: "We wrote it to meet India's **Digital Personal Data Protection Act, 2023** and **Digital Personal Data Protection Rules, 2025** (\"DPDP\"), the **Information Technology Act, 2000** and the rules made under it, and, where they apply to you, the **EU General Data Protection Regulation** (\"GDPR\"), the **UK GDPR and Data Protection Act 2018**, and US state privacy laws such as the **California Consumer Privacy Act** as amended by the CPRA (\"CCPA\")." },
      { type: "callout", tone: "info", title: "In short", text: "We use your data only to run DMForGrow. We do not sell or rent personal data. We do not use Instagram data or your customers' conversations for advertising, and we do not use them to train AI models. You can access, correct, export or delete your data at any time by emailing us." },

      { type: "h2", text: "1. Who we are" },
      { type: "p", text: `${SITE.name} is owned and operated by **${OWNER}**, a company incorporated in India${SITE.cin ? ` (CIN ${SITE.cin})` : ""}${SITE.address ? `, with its registered office at ${SITE.address}` : ""}. For account data we are the **Data Fiduciary** under DPDP and the **controller** under the GDPR and UK GDPR. You can reach us at **${MAIL}**.` },

      { type: "h2", text: "2. Our two roles" },
      { type: "ul", items: [
        "**Account data** — information about you, your team members and your business that we collect to run and bill your account, plus data about visitors to our website. Here **we decide** why and how data is used (Data Fiduciary / controller / \"business\" under the CCPA).",
        "**Workspace data** — Instagram comments, direct messages, profile details of people who interact with your account, contacts, deals, automations, knowledge-base content and files that your business brings into DMForGrow. Here **we process data on your behalf** and only on your documented instructions (Data Processor / processor / \"service provider\"). **You** are the Data Fiduciary or controller and are responsible for having a lawful basis, giving notice to your customers and obtaining any consent needed to message them.",
      ] },
      { type: "p", text: "If you are a customer or follower of a business that uses DMForGrow, that business controls your data. Please send requests to them first; we will help them respond." },

      { type: "h2", text: "3. What we collect" },
      { type: "table", head: ["Category", "Examples", "Source"], rows: [
        ["Account and profile", "Name, work email, phone, company name, role, hashed password, team invitations, login times", "You and your administrators"],
        ["Connected Instagram account", "Instagram professional account ID, username, name, account type, profile picture, follower and media counts, access tokens and granted permissions", "Meta, when you connect your account"],
        ["Workspace data", "Usernames and public profile details of people who comment or message, comments, direct messages, story replies, your posts and their captions and media links, post and account insights (reach, impressions, engagement), posts you schedule, tags, notes, deals, contact details you collect, knowledge-base content", "Meta's Instagram API and your team"],
        ["Billing", "Business name, GSTIN, billing address, plan, invoices, payment status and Razorpay identifiers. Card, UPI and bank details are entered on Razorpay and **never reach our servers**", "You and Razorpay"],
        ["Support and communications", "Emails, WhatsApp chats, contact-form and newsletter submissions", "You"],
        ["Technical and usage", "IP address, device and browser type, pages and features used, timestamps, error and security logs", "Your browser and our servers"],
      ] },
      { type: "p", text: "We do not ask for, and ask you not to upload, **sensitive data** such as health, financial account, biometric, religious, caste, sexual-orientation or government-ID data, apart from the GSTIN and billing details we need for tax invoices." },

      { type: "h2", text: "4. Why we use it and our legal basis" },
      { type: "table", head: ["Purpose", "India (DPDP)", "EU / UK (GDPR)"], rows: [
        ["Create and run your account, provide the features you use, process workspace data on your instructions", "Consent given at sign-up; data you voluntarily provide for a specified purpose (s. 7(a))", "Performance of a contract (Art. 6(1)(b))"],
        ["Take payment, issue GST invoices, keep accounting records", "Consent; compliance with law (s. 7)", "Contract; legal obligation (Art. 6(1)(b), (c))"],
        ["Security, fraud and abuse prevention, debugging, service logs", "Consent; reasonable security safeguards required by s. 8(5)", "Legitimate interests (Art. 6(1)(f))"],
        ["Support and service notices", "Consent", "Contract; legitimate interests"],
        ["Improve the product using aggregated or de-identified usage statistics", "Consent", "Legitimate interests"],
        ["Product news and marketing emails", "Consent (withdraw at any time)", "Consent (Art. 6(1)(a)) or, for existing customers, legitimate interests with an opt-out"],
        ["Respond to legal requests, enforce our terms, protect rights and safety", "Legitimate uses under s. 7 (compliance with law, court orders)", "Legal obligation; legitimate interests"],
      ] },
      { type: "p", text: "Where we rely on consent, you can **withdraw it as easily as you gave it** — by emailing us, using the unsubscribe link or disconnecting your Instagram account. Withdrawal does not affect processing already carried out, but we may no longer be able to provide the parts of the service that depend on it. Where we rely on legitimate interests, you can object (see section 11)." },

      { type: "h2", text: "5. Instagram and Meta platform data" },
      { type: "p", text: "DMForGrow connects to Instagram only through **Meta's official Instagram API**, with permissions you grant and can revoke at any time. We use Instagram platform data only to provide the features you enable:" },
      { type: "table", head: ["Permission", "What we use it for"], rows: [
        ["instagram_business_basic", "Read your account's username, name, profile picture, account type, follower and media counts, and list your posts so you can pick them in automations, giveaways and the scheduler"],
        ["instagram_business_manage_comments", "Receive comments on your posts, reply to them publicly, send one private reply per comment, and hide or delete comments under your moderation rules"],
        ["instagram_business_manage_messages", "Receive direct messages and story replies, show them in your inbox, and send replies (manual, automated or AI-written) to people who messaged you first"],
        ["instagram_business_content_publish", "Publish the photos, videos, reels and carousels you create or schedule in DMForGrow to your account"],
        ["instagram_business_manage_insights", "Show reach, impressions, engagement and follower metrics for your account and posts in your dashboard"],
      ] },
      { type: "ul", items: [
        "We **do not sell, license or buy** Instagram platform data, and we do not use it for advertising, for profiling people across businesses or to build data sets for third parties.",
        "We share it only with the sub-processors in section 7 that help us provide the service, or when the law requires.",
        "We comply with Meta's Platform Terms and Developer Policies, including their data-use and deletion requirements.",
        "When you disconnect an Instagram account, we stop collecting new data from it and delete our stored access token. You can also remove DMForGrow from the apps and websites connected to your Instagram or Facebook account in their settings.",
      ] },

      { type: "h2", text: "6. AI features" },
      { type: "p", text: "If your workspace turns on the AI agent or an AI step, the relevant message, conversation context and knowledge-base content are sent to our AI provider (Anthropic) to generate a reply. Under its commercial terms the provider **does not use this data to train its models**, and we do not use workspace data to train AI models either. AI replies are sent on your behalf under your settings; they do not make decisions with legal or similarly significant effects on anyone, and you can hand any conversation to a human at any time." },

      { type: "h2", text: "7. Who we share data with" },
      { type: "p", text: "We share personal data only with service providers (sub-processors) who process it for us under written contracts that require confidentiality, security and use only on our instructions." },
      { type: "table", head: ["Provider", "Purpose", "Location"], rows: [
        ["Meta Platforms (Instagram API)", "Receiving comments and messages, sending replies, publishing posts you schedule and reading insights through your connected account", "USA / Ireland"],
        ["Razorpay", "Payments for DMForGrow plans, and payment links if you connect your own Razorpay account", "India"],
        ["Anthropic", "Generating AI replies, only when AI features are enabled", "USA"],
        ["Vercel", "Hosting the website and dashboard front end", "Global edge network"],
        ["Railway", "Hosting the application servers and database", "USA / EU"],
        ["Resend", "Transactional email such as invitations, password resets and receipts", "USA"],
      ] },
      { type: "p", text: "We may also disclose data (a) when required by law, a court order or a lawful request from a government authority, including under the IT Act; (b) to protect the rights, property or safety of our users, the public or us; or (c) in a merger, acquisition or sale of assets, in which case the recipient must honour this policy and we will notify you. We will update the list above before adding a new sub-processor that handles workspace data." },
      { type: "p", text: "**We do not sell personal data** and do not \"share\" it for cross-context behavioural advertising as those terms are defined in the CCPA, and we have not done so in the past 12 months." },

      { type: "h2", text: "8. International transfers" },
      { type: "p", text: "We are based in India and some of our providers process data in other countries, including the USA and the EU. Under DPDP, transfers outside India are permitted except to countries the Government of India restricts by notification; we will stop any transfer to such a country. For personal data from the EU, EEA, UK or Switzerland, we rely on the European Commission's **Standard Contractual Clauses**, the UK **International Data Transfer Addendum**, or the recipient's certification under the **EU-US Data Privacy Framework** and its UK and Swiss extensions, with additional safeguards where needed. You can ask us for a copy of the relevant safeguards." },

      { type: "h2", text: "9. How long we keep it" },
      { type: "table", head: ["Data", "Retention"], rows: [
        ["Account and workspace data", "While your account is active. After you close your account or delete your workspace, we delete or anonymise it within 90 days, and remove it from backups within a further 30 days"],
        ["Data from a disconnected Instagram account", "Access token deleted immediately; related workspace data kept until you delete it or close your account"],
        ["Invoices, GST and accounting records", "8 years, as required by Indian tax and company law"],
        ["Security and access logs", "At least 1 year, as required by the DPDP Rules and CERT-In directions, then deleted"],
        ["Marketing preferences", "Until you unsubscribe; we then keep only a suppression record so we do not email you again"],
        ["Support conversations", "Up to 3 years after the conversation ends"],
      ] },
      { type: "p", text: "Once the purpose is served and no law requires us to keep the data, we erase it and instruct our processors to do the same." },

      { type: "h2", text: "10. Security and breaches" },
      { type: "p", text: "We maintain reasonable security practices and procedures as required by section 43A of the IT Act and section 8(5) of the DPDP Act, including encryption in transit (TLS), encryption of stored credentials (Instagram access tokens, AI keys, payment keys), hashed passwords, webhook signature verification, tenant isolation, role-based access, access logging and regular backups. See our [Security page](/security)." },
      { type: "p", text: "No system is perfectly secure. If a personal data breach occurs, we will, as the law requires, inform affected people without undue delay, notify the **Data Protection Board of India** (with a detailed report within 72 hours), report cyber-security incidents to **CERT-In** within 6 hours, and notify the relevant EU or UK supervisory authority within 72 hours where the GDPR applies. For workspace data, we will notify you without undue delay so you can meet your own obligations." },

      { type: "h2", text: "11. Your rights" },
      { type: "h3", text: "Everyone" },
      { type: "p", text: "Wherever you are, you can ask us to access, correct, update, complete, export or delete your personal data, withdraw consent and opt out of marketing. We will not discriminate against you or charge you for exercising your rights." },
      { type: "h3", text: "India (DPDP Act)" },
      { type: "ul", items: [
        "Obtain a summary of the personal data we process, our processing activities and the other fiduciaries and processors we share it with",
        "Correction, completion, updating and erasure of your personal data",
        "Withdraw consent at any time",
        "Grievance redressal (section 16), with escalation to the Data Protection Board of India if you are not satisfied",
        "Nominate another person to exercise your rights if you die or become incapable",
      ] },
      { type: "h3", text: "EU, EEA, UK and Switzerland (GDPR)" },
      { type: "ul", items: [
        "Access, rectification and erasure",
        "Restriction of processing and data portability",
        "Object to processing based on legitimate interests or used for direct marketing",
        "Not to be subject to decisions based solely on automated processing that significantly affect you (we do not make such decisions)",
        "Lodge a complaint with your local data protection authority or, in the UK, the Information Commissioner's Office",
      ] },
      { type: "h3", text: "United States (California and other states)" },
      { type: "ul", items: [
        "Know the categories and specific pieces of personal information we collect, and their sources, purposes and recipients (described in sections 3, 4 and 7)",
        "Delete and correct personal information",
        "Opt out of sale, sharing and targeted advertising — we do none of these, and we honour Global Privacy Control signals",
        "Limit the use of sensitive personal information — we do not use it beyond what is needed to provide the service",
        "Appeal our decision on your request by replying to our response",
      ] },
      { type: "h3", text: "How to make a request" },
      { type: "p", text: `Email **${MAIL}** with the subject "Privacy request", or ask an authorised agent to do so for you. We may need to verify your identity before acting. We respond within **30 days** (DPDP and GDPR, extendable where the law allows) or **45 days** (CCPA), and always within 90 days. If the request concerns a business's workspace data, we will pass it to that business and help them answer.` },

      { type: "h2", text: "12. Children" },
      { type: "p", text: "DMForGrow is a business tool and is not directed at children. You must be at least **18 years old** to create an account. We do not knowingly collect personal data from anyone under 18 (a child under DPDP), under 16 in the EU or under 13 in the USA, and we do not track children or target advertising at them. If you believe a child has given us personal data, contact us and we will delete it. Businesses must not use DMForGrow to target children or to process their data without verifiable parental consent." },

      { type: "h2", text: "13. Cookies and tracking" },
      { type: "p", text: "We use only the cookies and local storage needed to sign you in, keep you secure and remember your preferences. We do not use advertising cookies or sell browsing data. See our [Cookie Policy](/cookies)." },

      { type: "h2", text: "14. Deleting your account and data" },
      { type: "ol", items: [
        "Disconnect your Instagram account in the dashboard, or remove DMForGrow in your Instagram or Facebook app settings. We stop collecting data from it immediately.",
        `To delete your workspace or account and all related data, email **${MAIL}** from your account email with the subject "Delete my data". Owners can export contacts and deals from the dashboard first.`,
        "We confirm your request, delete the data within the periods in section 9 and tell you when it is done, apart from records the law requires us to keep.",
      ] },
      { type: "p", text: "If you messaged or commented on a business that uses DMForGrow, ask that business to delete your data, or email us with your Instagram username and the business's name and we will forward and support the request." },

      { type: "h2", text: "15. Changes to this policy" },
      { type: "p", text: "We may update this policy as our service or the law changes. The date at the top shows the current version. For material changes we will notify account owners by email or in the dashboard at least 15 days before they take effect and, where the law requires, ask for fresh consent." },

      { type: "h2", text: "16. Contact and Grievance Officer" },
      { type: "p", text: `Questions, requests and complaints about personal data can be sent to our **Grievance Officer**${SITE.grievanceOfficer ? ` (${SITE.grievanceOfficer})` : ""}. This person answers questions about personal data on our behalf under the DPDP Rules and is also our Grievance Officer under the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.` },
      { type: "ul", items: [
        `**Company:** ${OWNER}`,
        ...(SITE.address ? [`**Address:** ${SITE.address}`] : []),
        `**Email:** ${MAIL} (subject "Grievance Officer")`,
        "**Hours:** Monday to Friday, 10:00–18:00 IST",
      ] },
      { type: "p", text: "We acknowledge grievances within **48 hours** and resolve them within **30 days**, and in any case within the 90 days the DPDP Rules allow. If you are not satisfied, you may complain to the **Data Protection Board of India** or, if you are in the EU or UK, to your data protection authority." },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Service",
    metaDescription: `The binding agreement between ${OWNER} and every business that uses ${SITE.name}: acceptance, Instagram account risk, acceptable use, fees, data, AI, disclaimers, limitation of liability, indemnity and dispute resolution.`,
    summary: "The binding rules for using DMForGrow. Please read sections 4, 14, 15 and 16 carefully: they explain that Meta controls your Instagram account and limit our liability.",
    body: [
      { type: "p", text: `These Terms of Service ("**Terms**") are a legally binding agreement between **${OWNER}**, the owner and operator of ${SITE.name} ("**${SITE.name}**", "**we**", "**us**", "**our**"), and the person or business that creates an account on, signs in to or uses the ${SITE.name} website, dashboard, APIs or any related service (the "**Service**") ("**you**", "**your**").` },
      { type: "p", text: "By ticking the box that says you agree to these Terms, by signing in, or by using the Service in any way, you confirm that you have read, understood and accepted these Terms, our [Privacy Policy](/privacy) and our [Refund & Cancellation Policy](/refund-policy). If you accept on behalf of a company or other organisation, you confirm that you have authority to bind it, and \"you\" means that organisation. **If you do not agree, do not use the Service.**" },
      { type: "callout", tone: "warn", title: "Important — please read", text: "Your Instagram account belongs to you and is controlled by Meta, not by us. Meta can restrict, suspend, disable or delete any Instagram account at any time, for any reason, including because of automated activity. You use automation at your own risk. To the maximum extent permitted by law, **we are not responsible or liable for any action Meta takes on your account, or for any loss of followers, reach, content, messages, data, leads, sales or revenue that results**, and such an action does not entitle you to a refund. Our total liability is limited as set out in section 15, and disputes go to arbitration under section 20." },

      { type: "h2", text: "1. Definitions" },
      { type: "ul", items: [
        "**Meta** means Meta Platforms, Inc., its affiliates and the Instagram service they operate.",
        "**Instagram Account** means any Instagram professional, business or creator account you connect to the Service.",
        "**Workspace** means your account area in the Service, including its settings, team members and data.",
        "**Customer Content** means all content and data you or your team bring into or create in the Service, including messages, comments, automations, flows, broadcasts, templates, knowledge-base material, contacts, products, images, links and AI instructions.",
        "**AI Output** means any text or other content generated by the Service's artificial-intelligence features.",
        "**Third-Party Services** means any service, platform, API or software not owned by us, including Meta's platforms, payment gateways, AI model providers, hosting, email and storage providers.",
        "**Fees** means the amounts payable for a paid plan or add-on.",
      ] },

      { type: "h2", text: "2. The Service and our relationship with Meta" },
      { type: "p", text: "DMForGrow is a software tool that helps businesses manage and automate Instagram comments and direct messages, run a shared inbox, AI replies, contacts, sales pipelines, storefronts and payment links. It connects to Instagram only through Meta's official APIs, using permissions you grant." },
      { type: "ul", items: [
        "We are an independent company. We are **not owned by, affiliated with, endorsed by, sponsored by or acting as an agent of Meta or Instagram**. \"Instagram\" and \"Meta\" are trademarks of their owners.",
        "Meta may change, limit, rate-limit, deprecate or withdraw its APIs, permissions, features or policies at any time and without notice to us. When that happens, parts of the Service may change, stop working or be removed. **We are not liable for any such change or its effects**, and it does not entitle you to a refund.",
        "We do not and cannot guarantee that Meta will keep approving or allowing the Service, or any feature of it.",
      ] },

      { type: "h2", text: "3. Eligibility and your account" },
      { type: "ul", items: [
        "You must be at least **18 years old** and legally able to enter into a contract. The Service is for **business and professional use only**, not for personal, family or household use.",
        "You must give accurate, complete information and keep it up to date.",
        "You are responsible for keeping your passwords, sessions, API keys and connected accounts secure, and for **everything that happens under your account or Workspace**, including actions by team members, agencies or anyone you give access to, whether or not you authorised them.",
        "Tell us immediately at the email below if you suspect unauthorised access. We are not liable for any loss caused by unauthorised use of your credentials or by your failure to keep them secure.",
      ] },

      { type: "h2", text: "4. Your Instagram Account and actions taken by Meta" },
      { type: "p", text: "This section is a fundamental part of our agreement. You acknowledge and agree that:" },
      { type: "ol", items: [
        "**Meta alone controls your Instagram Account.** Meta may at its sole discretion warn, limit, rate-limit, shadow-ban, restrict features of, temporarily lock, suspend, disable, permanently ban or delete your Instagram Account or any content, and may revoke access tokens or permissions granted to the Service. These decisions are made by Meta, not by us, and are outside our control.",
        "**Automation carries risk.** Even when the Service is used as intended and within Meta's published rules, Meta's automated systems may flag, restrict or suspend accounts that send automated or high-volume messages or replies. You choose whether, how and how much to automate, and **you accept that risk**.",
        "**We are not responsible.** To the maximum extent permitted by law, we are **not responsible or liable** for any action Meta takes in relation to your Instagram Account, Facebook account, Page, business portfolio or content, **whatever the reason and even if the action is connected with automations, messages, replies or other activity carried out through the Service**. This includes any loss of the account itself, followers, reach, engagement, content, messages, contacts, leads, sales, revenue, profits, advertising spend, opportunities, goodwill or reputation.",
        "**We cannot reverse Meta's decisions.** We cannot restore, unlock or reinstate an Instagram Account. Any help we give with an appeal to Meta is a courtesy, carries no guarantee and creates no obligation.",
        "**No refund or compensation.** A restriction, suspension, ban or deletion of your Instagram Account by Meta, or the loss of any Meta permission, does not entitle you to any refund, credit, extension, damages or other compensation, and does not pause your plan.",
        "**Your compliance.** You must at all times follow Instagram's Terms of Use, Community Guidelines, Meta's Platform Terms, Developer Policies, Commerce Policies and any other rules Meta publishes, as updated from time to time. It is your responsibility to read and keep up with them.",
      ] },

      { type: "h2", text: "5. Your responsibilities for messaging, content and sales" },
      { type: "ul", items: [
        "**You are the sender.** Every comment reply, direct message, broadcast, follow-up, story reply, giveaway, link, offer and AI reply sent through the Service is sent by you and on your behalf. We do not review, approve, edit or monitor Customer Content before it is sent and have no obligation to do so.",
        "**Consent and opt-outs.** You must have a lawful basis and any consent required to collect, store and use people's data and to message them, and you must honour every request to stop messaging promptly. Only message people who have interacted with you first, within the windows Meta allows.",
        "**Laws you must follow.** You must comply with all laws that apply to you and your messages, including, where applicable, the Information Technology Act, 2000 and its rules, the Digital Personal Data Protection Act, 2023, the Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020, advertising standards, laws on contests, prize promotions and gambling, tax law, intellectual-property law, and foreign laws such as the GDPR and anti-spam laws where you message people in those places.",
        "**Your products, sales and promotions.** You alone are responsible for the products and services you advertise or sell, their quality, legality, pricing, delivery, returns, taxes, warranties and customer service, for the rules and fulfilment of any giveaway or contest you run, and for every payment link you send. We are not a party to any transaction between you and your customers.",
        "**Your claims.** You are responsible for the accuracy and legality of every statement, discount, claim and link you or your automations send.",
      ] },

      { type: "h2", text: "6. Acceptable use" },
      { type: "p", text: "You must not use the Service, or allow anyone else to use it, to:" },
      { type: "ul", items: [
        "send spam, unsolicited bulk messages, chain messages or messages to people who have not interacted with you or who asked you to stop;",
        "buy, sell or fake engagement, followers, likes or comments, run follow/unfollow or engagement-bait schemes, or buy, sell or rent Instagram accounts;",
        "send content that is unlawful, false, misleading, deceptive, defamatory, obscene, sexually explicit, hateful, harassing, threatening, violent or that infringes anyone's rights;",
        "promote or sell anything prohibited by Meta's policies or by law, including weapons, drugs, tobacco or vaping products, adult services, gambling or betting, counterfeit goods, pyramid or multi-level marketing schemes, get-rich-quick or investment schemes, unlicensed financial services or crypto schemes, or fake or rigged giveaways;",
        "phish, collect passwords or payment details under false pretences, impersonate any person or business, or distribute malware;",
        "target, contact or collect data about anyone under 18 without verifiable parental consent;",
        "scrape, harvest or export data you are not permitted to collect, or use the Service to get around Meta's limits, rate limits, safety systems or messaging windows;",
        "attempt to gain unauthorised access to, test the security of, overload, disrupt, decompile or reverse engineer the Service, or build a competing product using it;",
        "resell, sublicense, white-label or provide the Service to others except under a separate written agreement with us.",
      ] },
      { type: "p", text: "We may investigate suspected breaches, remove or disable content or automations, and **report unlawful activity or policy violations to Meta, law-enforcement or other authorities**, and share relevant information with them as the law permits or requires." },

      { type: "h2", text: "7. Plans, fees, taxes and payments" },
      { type: "ul", items: [
        "Paid plans are **prepaid** for the period you choose (1, 3 or 12 months) and do not renew automatically.",
        "Prices are shown in Indian Rupees **before GST**; GST at the applicable rate is added at checkout. You are responsible for any other taxes that apply to you.",
        "**Fees are non-refundable** except as expressly stated in our [Refund & Cancellation Policy](/refund-policy) or where the law requires a refund.",
        "Changing plans during a paid period credits the unused value of the current plan, as shown before you pay.",
        "If a paid plan ends without renewal, your Workspace moves to the free plan after a short grace period; your data is kept but free-plan limits apply.",
        "We may change our prices or plan features for future periods. Changes do not affect a period you have already paid for.",
        "If you raise a chargeback or payment dispute for Fees that were properly charged, we may suspend your Workspace until it is resolved.",
        "Fees charged by payment gateways or banks on payments you collect from your own customers, and the settlement of those payments, are a matter between you and that provider and are not our responsibility.",
      ] },

      { type: "h2", text: "8. Customer Content and data" },
      { type: "ul", items: [
        "You own your Customer Content. You grant us a worldwide, non-exclusive, royalty-free licence to host, store, copy, process, transmit and display it **only as needed to provide, secure, support and improve the Service** and as described in our [Privacy Policy](/privacy).",
        "You confirm that you have all rights, licences and consents needed for your Customer Content and for us to process it, and that it does not infringe anyone's rights or break any law.",
        "**You are responsible for keeping your own copies of important data.** You can export contacts and deals from the dashboard at any time. Although we keep backups for our own operational purposes, we do not guarantee that any data can be recovered, and to the maximum extent permitted by law we are not liable for the loss, corruption or deletion of any Customer Content, including data that becomes unavailable because Meta revokes access or because your account is suspended, closed or terminated.",
        "After your account is closed or terminated, we may delete your Workspace data as described in section 9 of our Privacy Policy, except where the law requires us to keep it.",
      ] },

      { type: "h2", text: "9. AI features" },
      { type: "ul", items: [
        "AI Output is generated automatically and **may be inaccurate, incomplete, out of date, inappropriate or offensive**, or may resemble content created by others. It is not professional advice.",
        "You decide whether to switch on AI features, how to configure and instruct them and what knowledge they use. You should review AI Output and its settings regularly. AI Output sent through your account is your message, and **you are solely responsible for it and for any consequences**.",
        "Do not use AI features for legal, medical, financial, safety-critical or other high-stakes decisions or advice without human review.",
        "We make no warranty about the accuracy, quality or suitability of AI Output.",
      ] },

      { type: "h2", text: "10. Third-Party Services" },
      { type: "p", text: "The Service relies on and may link to Third-Party Services, each of which has its own terms and privacy policies that you are responsible for reviewing and following. We do not control Third-Party Services and, to the maximum extent permitted by law, we are **not responsible or liable** for their availability, performance, security, errors, fees, policy changes, API changes or deprecations, or decisions (including decisions to restrict or close your accounts with them), or for any loss you suffer because of them. Your use of a Third-Party Service is solely between you and its provider." },

      { type: "h2", text: "11. Availability, changes and beta features" },
      { type: "ul", items: [
        "We aim to keep the Service running but **do not guarantee that it will be uninterrupted, timely, secure or error-free**, or that messages, replies or automations will always be delivered or triggered. We offer no service-level agreement unless we sign one with you separately. See [system status](/status).",
        "We may carry out maintenance and may add, change, limit, suspend or discontinue any feature or part of the Service at any time.",
        "Features labelled beta, preview, early access or similar are provided for evaluation, may be changed or withdrawn at any time and are provided **\"as is\" without any warranty**.",
      ] },

      { type: "h2", text: "12. No guarantee of results" },
      { type: "p", text: "We do not promise or guarantee any particular result from using the Service, including any growth in followers, engagement, reach, leads, sales or revenue, any delivery or open rate, or that your Instagram Account will not be flagged, limited or suspended. Any examples, case studies, estimates or statements on our website, in our marketing or from our team are illustrations only and are not guarantees." },

      { type: "h2", text: "13. Suspension and termination" },
      { type: "ul", items: [
        "You may stop using the Service at any time, and you may ask us to close your account.",
        "We may, at our discretion and **with or without prior notice**, suspend, limit or terminate your access to all or part of the Service, or disable any automation or content, if: (a) you breach these Terms or Meta's policies, or we reasonably suspect you have; (b) your use creates a risk to the Service, to us, to other customers, to our standing with Meta or to anyone else; (c) Meta, a payment provider, a court or an authority requires or requests it; (d) Fees are unpaid or a payment is disputed or reversed; (e) we suspect fraud or unlawful activity; or (f) we stop offering the Service. Where we think it is reasonable and lawful, we will try to tell you first.",
        "If we suspend or terminate your account because of your breach, you will not receive any refund of Fees already paid.",
        "On termination your right to use the Service ends immediately. Sections 4, 5, 8, 9, 10 and 12 to 21, and any unpaid Fees, survive termination.",
      ] },

      { type: "h2", text: "14. Disclaimer of warranties" },
      { type: "p", text: "**To the maximum extent permitted by law, the Service, AI Output and all content and information we provide are supplied \"AS IS\" and \"AS AVAILABLE\", with all faults and without any warranty, condition or representation of any kind, whether express, implied or statutory.** We specifically disclaim all implied warranties of merchantability, satisfactory quality, fitness for a particular purpose, title, non-infringement and accuracy, and any warranty that the Service will meet your requirements, will comply with Meta's policies at all times, will be free from errors, viruses or interruptions, or that defects will be corrected. You use the Service at your own risk." },

      { type: "h2", text: "15. Limitation of liability" },
      { type: "p", text: "To the maximum extent permitted by law:" },
      { type: "ol", items: [
        "**Excluded losses.** We, our directors, officers, employees and contractors will not be liable to you for any indirect, incidental, special, consequential, exemplary or punitive damages, or for any loss of profits, revenue, sales, business, contracts, goodwill, reputation, anticipated savings, data, content, followers, reach or engagement, or for business interruption, however caused and even if we were told it was possible.",
        "**Meta and Third-Party actions.** We will have **no liability at all** for any loss or damage arising from any action or decision of Meta (as described in section 4) or of any other Third-Party Service, from changes to their platforms or policies, or from any outage of the internet or of systems we do not control.",
        "**Your content and use.** We will have no liability for Customer Content, AI Output sent through your account, the messages you send, the products you sell, or your breach of these Terms, Meta's policies or the law.",
        "**Overall cap.** Our total aggregate liability for all claims of any kind arising out of or relating to these Terms or the Service, whether in contract, tort (including negligence), breach of statutory duty or otherwise, will not exceed **the higher of (a) the Fees you actually paid us for the Service in the three (3) months immediately before the event giving rise to the first claim, and (b) ₹1,000 (one thousand Indian Rupees)**.",
        "**What we do not limit.** Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under applicable law, such as liability for fraud or wilful misconduct.",
      ] },
      { type: "p", text: "You agree that these limitations are reasonable, reflect a fair allocation of risk, and form an essential basis of the bargain between us, without which we would not provide the Service at the prices we charge." },

      { type: "h2", text: "16. Indemnity" },
      { type: "p", text: `You will defend, indemnify and hold harmless ${OWNER} and its directors, officers, employees, contractors and agents from and against all claims, demands, proceedings, losses, damages, liabilities, fines, penalties, costs and expenses (including reasonable legal fees) arising out of or relating to: (a) your Customer Content or AI Output sent through your account; (b) your messages, automations, broadcasts, giveaways and marketing; (c) the products and services you sell and your dealings with your customers; (d) your breach of these Terms, Meta's terms or policies, or any law, including data-protection and consumer laws; (e) any personal data you collected or used without a lawful basis or consent; or (f) the acts or omissions of your team members or anyone using your account. We may take part in the defence of any claim with counsel of our choice, and you will not settle a claim that affects us without our written consent.` },

      { type: "h2", text: "17. Force majeure" },
      { type: "p", text: "We are not liable for any failure or delay in performing our obligations caused by events beyond our reasonable control, including natural disasters, fire, flood, epidemics, war, terrorism, riots, strikes, government orders or restrictions, internet or telecommunications failures, power failures, cyber-attacks, outages or failures of hosting, cloud or other Third-Party Services, and any outage, restriction, policy change or API change by Meta." },

      { type: "h2", text: "18. Intellectual property and feedback" },
      { type: "ul", items: [
        "The Service, including its software, design, text, graphics, logos and the DMForGrow name and brand, is owned by us or our licensors and is protected by intellectual-property laws. Subject to these Terms and payment of any Fees, we grant you a limited, non-exclusive, non-transferable, non-sublicensable, revocable right to use the Service for your internal business purposes during your subscription. We reserve all other rights.",
        "If you send us ideas, suggestions or feedback, we may use them freely and without any obligation to you.",
        "You must keep confidential any non-public information about the Service that we share with you.",
      ] },

      { type: "h2", text: "19. Changes to these Terms" },
      { type: "p", text: "We may update these Terms from time to time. The date at the top of this page shows when they last changed. For material changes we will notify account owners by email or in the dashboard before the changes take effect. By continuing to use the Service after the effective date, you accept the updated Terms; if you do not agree, you must stop using the Service. We may ask you to accept updated Terms again when you next sign in." },

      { type: "h2", text: "20. Governing law and dispute resolution" },
      { type: "ol", items: [
        "**Governing law.** These Terms and any dispute or claim arising out of or in connection with them or the Service (including non-contractual disputes) are governed by the laws of India.",
        `**Talk to us first.** Before starting any proceedings, you must first raise the dispute in writing with our Grievance Officer at **${MAIL}** and give us **30 days** to try to resolve it in good faith.`,
        "**Arbitration.** Any dispute that is not resolved within those 30 days will be finally resolved by binding arbitration under the **Arbitration and Conciliation Act, 1996**, by a **sole arbitrator** appointed by us. The seat and venue of arbitration is **Mau, Uttar Pradesh, India**, the proceedings will be conducted in **English**, and the award will be final and binding on both parties. Arbitration may be conducted online where the arbitrator permits.",
        "**Individual claims only.** To the extent permitted by law, all claims must be brought in your individual capacity, and not as a plaintiff or member of any class, collective or representative proceeding.",
        "**Courts.** Subject to the arbitration clause, the courts at **Mau, Uttar Pradesh** have exclusive jurisdiction, including for interim or urgent relief and for any matter that cannot lawfully be referred to arbitration.",
        "**Time limit.** To the extent permitted by law, any claim must be brought within **one (1) year** after the facts giving rise to it arose, failing which it is permanently barred.",
      ] },

      { type: "h2", text: "21. General" },
      { type: "ul", items: [
        "**Entire agreement.** These Terms, together with our Privacy Policy, Refund & Cancellation Policy and any order or plan details, are the entire agreement between you and us about the Service and replace any earlier understanding. If there is a conflict, these Terms prevail.",
        "**Severability.** If any part of these Terms is found invalid or unenforceable, it will be enforced to the maximum extent permitted and the rest of the Terms will remain in full force.",
        "**No waiver.** Our failure or delay in enforcing any right is not a waiver of it.",
        "**Assignment.** You may not assign or transfer these Terms without our written consent. We may assign them, including as part of a merger, acquisition or sale of assets.",
        "**No partnership.** Nothing in these Terms creates a partnership, joint venture, agency or employment relationship.",
        "**Electronic contract.** These Terms are an electronic record under the Information Technology Act, 2000 and do not require a physical or digital signature. Your electronic acceptance is binding, and we keep a record of when and which version you accepted.",
        "**Notices.** We may give you notices by email to your account address or in the dashboard. You must send notices to us by email at the address below.",
      ] },

      { type: "h2", text: "22. Contact and Grievance Officer" },
      { type: "p", text: `For questions or complaints about these Terms or the Service, contact our **Grievance Officer**${SITE.grievanceOfficer ? ` (${SITE.grievanceOfficer})` : ""}, appointed under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.` },
      { type: "ul", items: [
        `**Company:** ${OWNER}`,
        ...(SITE.address ? [`**Address:** ${SITE.address}`] : []),
        `**Email:** ${MAIL} (subject "Grievance Officer")`,
        "**Hours:** Monday to Friday, 10:00–18:00 IST",
      ] },
      { type: "p", text: "We acknowledge complaints within **24 hours** and aim to resolve them within **15 days**." },
    ],
  },
  {
    slug: "refund-policy",
    title: "Refund & Cancellation Policy",
    metaDescription: "How to cancel DMForGrow, when refunds apply, how failed or duplicate payments are handled and how long refunds take.",
    summary: "Plans are prepaid and don't auto-renew. Here's how cancellation and refunds work.",
    body: [
      { type: "h2", text: "Cancellation" },
      { type: "ul", items: ["Plans are prepaid and **do not renew automatically**, so there is nothing to cancel to avoid a future charge", "Your plan stays active until the end of the period you paid for", "You can delete your workspace at any time by contacting us"] },
      { type: "h2", text: "Refunds" },
      { type: "table", head: ["Situation", "What happens"], rows: [["You paid, but the payment failed or was charged twice", "Failed and duplicate payments are refunded to the original payment method. Razorpay normally completes these within 5–7 business days. Contact us if it takes longer."], ["You are unhappy within 7 days of your **first** paid purchase", "Contact us and we'll refund your payment in full, provided the account hasn't broken our Terms or Meta's policies."], ["You want to leave partway through a paid period", "We don't refund the unused part of a period after the first 7 days."], ["You move to a different plan", "The unused value of your current plan is credited toward the new plan at checkout, so you don't pay twice for the same time."], ["A billing error on our side", "We correct it and refund the difference."], ["Meta restricts, suspends, bans or deletes your Instagram account, or removes a permission", "This is Meta's decision and outside our control, so it is **not a ground for a refund**, credit, extension or pause of your plan (see section 4 of our [Terms](/terms))."]] },
      { type: "h2", text: "What isn't refundable" },
      { type: "ul", items: ["Fees charged by Razorpay or others on payments you collected from your own customers", "GST that has already been remitted, except where the underlying payment is refunded"] },
      { type: "h2", text: "How to ask for a refund" },
      { type: "p", text: `Email **${MAIL}** from your account email with your invoice number and the reason. We reply within 2 business days. Approved refunds are issued to the original payment method and usually reach you within 5–10 business days, depending on your bank.` },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    metaDescription: `What cookies and similar storage ${CO} uses on the DMForGrow website and dashboard, and how to control them.`,
    summary: "We keep this simple: only what's needed to sign you in and remember your preferences.",
    body: [
      { type: "p", text: "Cookies and similar technologies (such as your browser's local storage) are small pieces of data stored on your device. Here is what DMForGrow uses." },
      { type: "table", head: ["Purpose", "What we store", "Duration"], rows: [["Sign-in (essential)", "Session tokens that keep you signed in to the dashboard", "Until you sign out or the session expires"], ["Preferences (essential)", "Your light or dark theme choice", "Until you clear it"], ["Security (essential)", "Short-lived data used to protect forms and rate-limit abuse", "Short"]] },
      { type: "p", text: "We do not use advertising cookies. If we add analytics or other optional technologies in future, we will update this page and ask for your consent where the law requires it." },
      { type: "h2", text: "Third-party content" },
      { type: "p", text: "When you pay, Razorpay's checkout may set its own cookies to process the transaction and prevent fraud; see Razorpay's policies. Embedded fonts are served from our own domain." },
      { type: "h2", text: "Your choices" },
      { type: "p", text: "You can clear stored data or block cookies in your browser settings. Blocking essential storage will stop you from signing in." },
    ],
  },
  {
    slug: "security",
    title: "Security",
    metaDescription: `How ${CO} protects DMForGrow customer data: encryption, access control, webhook verification, tenant isolation and responsible disclosure.`,
    summary: "The practical measures we take to protect your workspace and your customers' data.",
    body: [
      { type: "p", text: "Your conversations and contacts are among your business's most sensitive data. This page describes the controls we operate today." },
      { type: "h2", text: "Data protection" },
      { type: "ul", items: ["**Encryption in transit** using TLS for the website, dashboard and API", "**Credentials encrypted at rest** — Instagram access tokens, AI keys, integration secrets and payment keys are encrypted before they are stored, and are never shown again in full", "**Passwords are hashed** with a modern algorithm; we can't read them", "**Card and UPI details never touch our servers** — payments are handled by Razorpay"] },
      { type: "h2", text: "Access control" },
      { type: "ul", items: ["Role-based access (owner, admin, agent, viewer) checked on every request, so removing someone takes effect immediately", "Every workspace's data is isolated from every other's", "Sessions use short-lived tokens with refresh and can be ended by changing your password", "API keys are hashed, shown once and can be revoked at any time"] },
      { type: "h2", text: "Application security" },
      { type: "ul", items: ["Inbound Instagram and integration webhooks are accepted only if their **signature verifies**", "Outbound webhooks are signed with HMAC-SHA256, and requests to private or internal network addresses are blocked", "Rate limiting on sign-in, forms and APIs", "Input validation and constrained file uploads", "CSV exports neutralise spreadsheet formulas"] },
      { type: "h2", text: "Operations" },
      { type: "ul", items: ["Hosted on reputable cloud providers that maintain their own certifications", "Managed database with backups", "Health monitoring and a public [status page](/status)"] },
      { type: "callout", tone: "info", title: "Independent audits", text: "We have not yet completed an independent certification such as SOC 2 or ISO 27001 for DMForGrow itself. If your organisation needs a security questionnaire or a data processing agreement, contact us." },
      { type: "h2", text: "Report a vulnerability" },
      { type: "p", text: `If you believe you've found a security issue, email **${MAIL}** with details. Please give us reasonable time to fix it before disclosing it publicly, and avoid accessing other people's data. We acknowledge reports promptly and appreciate responsible research.` },
    ],
  },
  {
    slug: "compliance",
    title: "Compliance",
    metaDescription: `How DMForGrow supports compliance with Meta's Instagram platform policies, India's DPDP Act, GDPR and GST invoicing requirements.`,
    summary: "How the product helps you meet Instagram platform, data-protection and tax obligations.",
    body: [
      { type: "h2", text: "Instagram platform policies" },
      { type: "p", text: "DMForGrow uses Meta's official Instagram API. The product is built around its rules: businesses only reply to people who commented or messaged first, replies are limited to 24 hours after the person's last message (7 days for human agents where permitted), one private reply per comment, and stop requests are honoured. You remain responsible for what you send." },
      { type: "h2", text: "India — DPDP Act, 2023 and IT Act, 2000" },
      { type: "ul", items: ["We collect personal data for stated purposes and describe them in our [Privacy Policy](/privacy)", "You can ask us to access, correct or erase your data and to withdraw consent", "We take reasonable security safeguards and will report breaches as the law requires", `A grievance channel is available at ${MAIL}`] },
      { type: "h2", text: "GDPR and UK GDPR" },
      { type: "p", text: "For customers who are subject to GDPR, we act as your **processor** for workspace data. We can provide a data processing agreement on request, list our sub-processors (see the Privacy Policy) and support your data-subject requests. International transfers rely on appropriate safeguards." },
      { type: "h2", text: "GST invoicing" },
      { type: "p", text: "Every paid plan generates a tax invoice with a sequential number, our GSTIN (when configured), your billing details and a CGST + SGST or IGST breakup based on the place of supply. Add your GSTIN under Billing details to claim input tax credit." },
      { type: "h2", text: "Payments" },
      { type: "p", text: "Payments are processed by Razorpay, which is PCI DSS compliant. We do not store your card, UPI or bank credentials." },
      { type: "h2", text: "Need something specific?" },
      { type: "p", text: `Contact **${MAIL}** for a security questionnaire, a data processing agreement or other compliance documents.` },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    metaDescription: `${CO}'s commitment to making the DMForGrow website and dashboard usable by everyone, and how to report a problem.`,
    summary: "We aim for a site and dashboard that everyone can use.",
    body: [
      { type: "p", text: "We want everyone to be able to use DMForGrow, including people who use screen readers, keyboards, zoom or high-contrast settings. We aim to follow the Web Content Accessibility Guidelines (WCAG) 2.1 level AA." },
      { type: "h2", text: "What we do" },
      { type: "ul", items: ["Semantic headings, landmarks and labelled form fields", "Keyboard access to menus, dialogs and forms", "Visible focus states and sufficient colour contrast in both the light and dark themes", "Respect for the 'reduce motion' setting", "Text alternatives for meaningful icons"] },
      { type: "h2", text: "Known limitations" },
      { type: "ul", items: ["The pipeline board supports drag and drop; the same changes can be made from the deal dialog using the Stage field, which works with a keyboard", "The visual flow builder canvas is mouse-oriented; we are working on better keyboard support"] },
      { type: "h2", text: "Tell us about a problem" },
      { type: "p", text: `If something isn't accessible to you, email **${MAIL}** with the page and what went wrong. We'll respond within a few business days and work on a fix.` },
    ],
  },
];

export const legalBySlug = (slug: string) => LEGAL.find((l) => l.slug === slug);
