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
    metaDescription: `How ${OWNER} collects, uses, shares and protects personal data when you use GramForGrow, and your rights under India's DPDP Act, the GDPR, UK GDPR and US state privacy laws.`,
    summary: "What we collect, why, the legal basis, who we share it with, where it is stored, how long we keep it and how you can exercise your rights — in India and abroad.",
    body: [
      { type: "p", text: `${SITE.name} is a product of **${OWNER}**. This policy explains how **${OWNER}** ("**${SITE.name}**", "we", "us", "our") collects, uses, shares and protects personal data when you visit our website, create an account or use the ${SITE.name} service.` },
      { type: "p", text: "We wrote it to meet India's **Digital Personal Data Protection Act, 2023** and **Digital Personal Data Protection Rules, 2025** (\"DPDP\"), the **Information Technology Act, 2000** and the rules made under it, and, where they apply to you, the **EU General Data Protection Regulation** (\"GDPR\"), the **UK GDPR and Data Protection Act 2018**, and US state privacy laws such as the **California Consumer Privacy Act** as amended by the CPRA (\"CCPA\")." },
      { type: "callout", tone: "info", title: "In short", text: "We use your data only to run GramForGrow. We do not sell or rent personal data. We do not use Instagram data or your customers' conversations for advertising, and we do not use them to train AI models. You can access, correct, export or delete your data at any time by emailing us." },

      { type: "h2", text: "1. Who we are" },
      { type: "p", text: `${SITE.name} is owned and operated by **${OWNER}**, a company incorporated in India${SITE.cin ? ` (CIN ${SITE.cin})` : ""}${SITE.address ? `, with its registered office at ${SITE.address}` : ""}. For account data we are the **Data Fiduciary** under DPDP and the **controller** under the GDPR and UK GDPR. You can reach us at **${MAIL}**.` },

      { type: "h2", text: "2. Our two roles" },
      { type: "ul", items: [
        "**Account data** — information about you, your team members and your business that we collect to run and bill your account, plus data about visitors to our website. Here **we decide** why and how data is used (Data Fiduciary / controller / \"business\" under the CCPA).",
        "**Workspace data** — Instagram comments, direct messages, profile details of people who interact with your account, contacts, deals, automations, knowledge-base content and files that your business brings into GramForGrow. Here **we process data on your behalf** and only on your documented instructions (Data Processor / processor / \"service provider\"). **You** are the Data Fiduciary or controller and are responsible for having a lawful basis, giving notice to your customers and obtaining any consent needed to message them.",
      ] },
      { type: "p", text: "If you are a customer or follower of a business that uses GramForGrow, that business controls your data. Please send requests to them first; we will help them respond." },

      { type: "h2", text: "3. What we collect" },
      { type: "table", head: ["Category", "Examples", "Source"], rows: [
        ["Account and profile", "Name, work email, phone, company name, role, hashed password, team invitations, login times", "You and your administrators"],
        ["Connected Instagram account", "Instagram professional account ID, username, profile picture, linked Facebook Page, access tokens and granted permissions", "Meta, when you connect your account"],
        ["Workspace data", "Usernames and public profile details of people who comment or message, comments, direct messages, story replies, media links, tags, notes, deals, contact details you collect, knowledge-base content", "Meta's Instagram API and your team"],
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
      { type: "p", text: "GramForGrow connects to Instagram only through **Meta's official Instagram API**, with permissions you grant and can revoke at any time. We use Instagram platform data only to provide the features you enable — receiving comments and messages, sending replies and DMs, showing conversations in your inbox and reporting on them." },
      { type: "ul", items: [
        "We **do not sell, license or buy** Instagram platform data, and we do not use it for advertising, for profiling people across businesses or to build data sets for third parties.",
        "We share it only with the sub-processors in section 7 that help us provide the service, or when the law requires.",
        "We comply with Meta's Platform Terms and Developer Policies, including their data-use and deletion requirements.",
        "When you disconnect an Instagram account, we stop collecting new data from it and delete our stored access token. You can also remove GramForGrow from the apps and websites connected to your Instagram or Facebook account in their settings.",
      ] },

      { type: "h2", text: "6. AI features" },
      { type: "p", text: "If your workspace turns on the AI agent or an AI step, the relevant message, conversation context and knowledge-base content are sent to our AI provider (Anthropic) to generate a reply. Under its commercial terms the provider **does not use this data to train its models**, and we do not use workspace data to train AI models either. AI replies are sent on your behalf under your settings; they do not make decisions with legal or similarly significant effects on anyone, and you can hand any conversation to a human at any time." },

      { type: "h2", text: "7. Who we share data with" },
      { type: "p", text: "We share personal data only with service providers (sub-processors) who process it for us under written contracts that require confidentiality, security and use only on our instructions." },
      { type: "table", head: ["Provider", "Purpose", "Location"], rows: [
        ["Meta Platforms (Instagram API)", "Receiving comments and messages and sending replies through your connected account", "USA / Ireland"],
        ["Razorpay", "Payments for GramForGrow plans, and payment links if you connect your own Razorpay account", "India"],
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
      { type: "p", text: "GramForGrow is a business tool and is not directed at children. You must be at least **18 years old** to create an account. We do not knowingly collect personal data from anyone under 18 (a child under DPDP), under 16 in the EU or under 13 in the USA, and we do not track children or target advertising at them. If you believe a child has given us personal data, contact us and we will delete it. Businesses must not use GramForGrow to target children or to process their data without verifiable parental consent." },

      { type: "h2", text: "13. Cookies and tracking" },
      { type: "p", text: "We use only the cookies and local storage needed to sign you in, keep you secure and remember your preferences. We do not use advertising cookies or sell browsing data. See our [Cookie Policy](/cookies)." },

      { type: "h2", text: "14. Deleting your account and data" },
      { type: "ol", items: [
        "Disconnect your Instagram account in the dashboard, or remove GramForGrow in your Instagram or Facebook app settings. We stop collecting data from it immediately.",
        `To delete your workspace or account and all related data, email **${MAIL}** from your account email with the subject "Delete my data". Owners can export contacts and deals from the dashboard first.`,
        "We confirm your request, delete the data within the periods in section 9 and tell you when it is done, apart from records the law requires us to keep.",
      ] },
      { type: "p", text: "If you messaged or commented on a business that uses GramForGrow, ask that business to delete your data, or email us with your Instagram username and the business's name and we will forward and support the request." },

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
    metaDescription: `The agreement between ${CO} and customers who use GramForGrow: accounts, acceptable use, fees, data, AI features, liability and more.`,
    summary: "The rules for using GramForGrow, what you can expect from us and what we expect from you.",
    body: [
      { type: "p", text: `These terms are an agreement between **${CO}** ("we", "us") and the business or person who creates a GramForGrow account ("you"). By creating an account or using the service you accept them. If you accept on behalf of a company, you confirm you are authorised to do so.` },
      { type: "h2", text: "1. The service" },
      { type: "p", text: "GramForGrow is software for automating and managing Instagram comments and direct messages, sales and payments. It works with the Instagram API provided by Meta. We are an independent company and are **not affiliated with, endorsed by or sponsored by Instagram or Meta**." },
      { type: "h2", text: "2. Your account" },
      { type: "ul", items: ["Provide accurate information and keep it up to date", "Keep credentials confidential and tell us promptly about unauthorised use", "You are responsible for activity under your workspace, including by team members you invite"] },
      { type: "h2", text: "3. Using Instagram responsibly" },
      { type: "p", text: "You must follow the [Instagram Terms of Use](https://help.instagram.com/581066165581870), the [Instagram Community Guidelines](https://help.instagram.com/477434105621119), Meta's Platform Terms and Developer Policies, and applicable law. In particular:" },
      { type: "ul", items: ["Only use automation to respond to people who have commented on your posts or messaged you, and honour requests to stop", "Do not send spam, unlawful, deceptive, harassing or prohibited content, or misleading links", "Do not use the service for categories prohibited by Meta's policies", "You are responsible for the content of your automations and replies, and for Meta's decisions about your account, including limits, restrictions and suspensions"] },
      { type: "h2", text: "4. Acceptable use" },
      { type: "p", text: "Do not misuse the service: no attempts to breach security, overload or reverse engineer it, no illegal activity, no infringing others' rights, and no reselling or white-labelling the service except under a written partner agreement." },
      { type: "h2", text: "5. Plans, fees and taxes" },
      { type: "ul", items: ["Paid plans are **prepaid** for the period you choose (1, 3 or 12 months) and do not renew automatically", "Prices are shown in Indian Rupees **before GST**; 18% GST (or the rate applicable at the time) is added at checkout", "Changing to a different plan during a paid period credits the unused value of the current plan, as shown before you pay", "If a paid plan ends without renewal, the workspace moves to the free plan after a short grace period; your data is kept but plan limits apply", "Any fees charged by Razorpay or others on payments you collect from your own customers are separate from our fees and are your responsibility"] },
      { type: "p", text: "See our [Refund & Cancellation Policy](/refund-policy) for cancellation and refunds." },
      { type: "h2", text: "6. Your data" },
      { type: "p", text: "You own your workspace data. You give us permission to process it only to provide and support the service, as described in our [Privacy Policy](/privacy). You are responsible for having the rights and consents needed to upload it and to message your contacts. You can export contacts and deals, and you can ask us to delete your workspace." },
      { type: "h2", text: "7. AI features" },
      { type: "p", text: "AI-generated replies may be inaccurate or incomplete. You are responsible for configuring the AI agent, reviewing its output and deciding where it is appropriate to use. Do not rely on it for legal, medical, financial or other high-stakes advice to your customers without human review." },
      { type: "h2", text: "8. Third-party services" },
      { type: "p", text: "The service depends on third parties such as Meta, Razorpay, Anthropic and hosting providers. We are not responsible for their availability, changes or decisions, though we will work with you to resolve issues." },
      { type: "h2", text: "9. Availability and support" },
      { type: "p", text: "We work to keep the service available but do not guarantee uninterrupted operation. We may perform maintenance and will try to give notice of planned downtime. Check [system status](/status)." },
      { type: "h2", text: "10. Suspension and termination" },
      { type: "p", text: "You may stop using the service at any time. We may suspend or terminate access if you breach these terms, put the service or others at risk, or where required by law or by Meta. Where reasonable we will tell you first." },
      { type: "h2", text: "11. Disclaimers" },
      { type: "p", text: "The service is provided \"as is\" and \"as available\". To the extent permitted by law, we disclaim all warranties, including merchantability, fitness for a particular purpose and non-infringement." },
      { type: "h2", text: "12. Limitation of liability" },
      { type: "p", text: "To the extent permitted by law, we are not liable for indirect, incidental, special or consequential damages, or loss of profits, revenue or data. Our total liability for any claim relating to the service is limited to the fees you paid us in the twelve months before the event giving rise to the claim. Nothing limits liability that cannot be limited by law." },
      { type: "h2", text: "13. Indemnity" },
      { type: "p", text: "You will indemnify us against third-party claims arising from your content, your messaging practices or your breach of these terms or of Meta's policies." },
      { type: "h2", text: "14. Governing law" },
      { type: "p", text: "These terms are governed by the laws of India. Courts having jurisdiction at the location of our registered office have exclusive jurisdiction, subject to any mandatory rights you have." },
      { type: "h2", text: "15. Changes and contact" },
      { type: "p", text: `We may update these terms; for material changes we will give notice. Continued use after the effective date means you accept them. Questions: **${MAIL}**.` },
    ],
  },
  {
    slug: "refund-policy",
    title: "Refund & Cancellation Policy",
    metaDescription: "How to cancel GramForGrow, when refunds apply, how failed or duplicate payments are handled and how long refunds take.",
    summary: "Plans are prepaid and don't auto-renew. Here's how cancellation and refunds work.",
    body: [
      { type: "h2", text: "Cancellation" },
      { type: "ul", items: ["Plans are prepaid and **do not renew automatically**, so there is nothing to cancel to avoid a future charge", "Your plan stays active until the end of the period you paid for", "You can delete your workspace at any time by contacting us"] },
      { type: "h2", text: "Refunds" },
      { type: "table", head: ["Situation", "What happens"], rows: [["You paid, but the payment failed or was charged twice", "Failed and duplicate payments are refunded to the original payment method. Razorpay normally completes these within 5–7 business days. Contact us if it takes longer."], ["You are unhappy within 7 days of your **first** paid purchase", "Contact us and we'll refund your payment in full, provided the account hasn't broken our Terms or Meta's policies."], ["You want to leave partway through a paid period", "We don't refund the unused part of a period after the first 7 days."], ["You move to a different plan", "The unused value of your current plan is credited toward the new plan at checkout, so you don't pay twice for the same time."], ["A billing error on our side", "We correct it and refund the difference."]] },
      { type: "h2", text: "What isn't refundable" },
      { type: "ul", items: ["Fees charged by Razorpay or others on payments you collected from your own customers", "GST that has already been remitted, except where the underlying payment is refunded"] },
      { type: "h2", text: "How to ask for a refund" },
      { type: "p", text: `Email **${MAIL}** from your account email with your invoice number and the reason. We reply within 2 business days. Approved refunds are issued to the original payment method and usually reach you within 5–10 business days, depending on your bank.` },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    metaDescription: `What cookies and similar storage ${CO} uses on the GramForGrow website and dashboard, and how to control them.`,
    summary: "We keep this simple: only what's needed to sign you in and remember your preferences.",
    body: [
      { type: "p", text: "Cookies and similar technologies (such as your browser's local storage) are small pieces of data stored on your device. Here is what GramForGrow uses." },
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
    metaDescription: `How ${CO} protects GramForGrow customer data: encryption, access control, webhook verification, tenant isolation and responsible disclosure.`,
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
      { type: "callout", tone: "info", title: "Independent audits", text: "We have not yet completed an independent certification such as SOC 2 or ISO 27001 for GramForGrow itself. If your organisation needs a security questionnaire or a data processing agreement, contact us." },
      { type: "h2", text: "Report a vulnerability" },
      { type: "p", text: `If you believe you've found a security issue, email **${MAIL}** with details. Please give us reasonable time to fix it before disclosing it publicly, and avoid accessing other people's data. We acknowledge reports promptly and appreciate responsible research.` },
    ],
  },
  {
    slug: "compliance",
    title: "Compliance",
    metaDescription: `How GramForGrow supports compliance with Meta's Instagram platform policies, India's DPDP Act, GDPR and GST invoicing requirements.`,
    summary: "How the product helps you meet Instagram platform, data-protection and tax obligations.",
    body: [
      { type: "h2", text: "Instagram platform policies" },
      { type: "p", text: "GramForGrow uses Meta's official Instagram API. The product is built around its rules: businesses only reply to people who commented or messaged first, replies are limited to 24 hours after the person's last message (7 days for human agents where permitted), one private reply per comment, and stop requests are honoured. You remain responsible for what you send." },
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
    metaDescription: `${CO}'s commitment to making the GramForGrow website and dashboard usable by everyone, and how to report a problem.`,
    summary: "We aim for a site and dashboard that everyone can use.",
    body: [
      { type: "p", text: "We want everyone to be able to use GramForGrow, including people who use screen readers, keyboards, zoom or high-contrast settings. We aim to follow the Web Content Accessibility Guidelines (WCAG) 2.1 level AA." },
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
