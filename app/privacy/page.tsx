export default function PrivacyPolicy() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-sm text-foreground leading-relaxed">
      <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Last updated: May 3, 2026</p>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">What is VibeWallet?</h2>
        <p>VibeWallet is a personal finance tracker that reads your bank transaction alert emails from Gmail to help you understand your spending habits. It is a personal tool — not a financial institution, bank, or payment service.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">What data we access</h2>
        <p>When you sign in with Google, we request read-only access to your Gmail (<code>gmail.readonly</code> scope). We use this access exclusively to:</p>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Search for transaction alert emails from your bank (HDFC, ICICI, Equitas, Groww, SBI, Axis and Zerodha(More to come in future as we are still adding and working on that))</li>
          <li>Parse the amount, merchant name, and date from those emails</li>
        </ul>
        <p className="mt-2">We do <strong>not</strong> read, store, or process any other emails in your inbox.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">What we store</h2>
        <p>We store only the <strong>parsed transaction data</strong> (amount, type, merchant, date) in our database — never the raw email content, email body, or any other personal correspondence. Your Gmail credentials are never stored on our servers.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">How we use your data</h2>
        <p>Your transaction data is used solely to display your personal spending dashboard. We do not sell, share, rent, or transfer your data to any third party for any purpose.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">Data retention</h2>
        <p>Your data is stored as long as you use the app. You can request deletion of all your data at any time by contacting us at the email below.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">Third-party services</h2>
        <p>VibeWallet uses the following third-party services:</p>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li><strong>Google OAuth</strong> — for sign-in and Gmail read access</li>
          <li><strong>Supabase</strong> — for secure database storage</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">Revoking access</h2>
        <p>You can revoke VibeWallet's access to your Gmail at any time from your <a href="https://myaccount.google.com/permissions" className="underline" target="_blank" rel="noopener noreferrer">Google Account permissions page</a>.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">Contact</h2>
        <p>For any privacy questions or data deletion requests, contact us at: <strong>kushucon@gmail.com</strong></p>
      </section>
    </main>
  );
}