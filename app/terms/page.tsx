export default function TermsOfService() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-sm text-foreground leading-relaxed">
      <h1 className="text-2xl font-bold mb-1">Terms of Service</h1>
      <p className="text-muted-foreground mb-8">Last updated: May 3, 2026</p>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">1. Acceptance</h2>
        <p>By using VibeWallet, you agree to these terms. If you do not agree, please do not use the app.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">2. What VibeWallet does</h2>
        <p>VibeWallet reads your bank transaction alert emails from Gmail (read-only) and displays a personal spending dashboard. It is a personal productivity tool only — it does not move money, make payments, or interact with your bank in any way.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">3. Your responsibilities</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>You must be 18 years or older to use this app.</li>
          <li>You are responsible for maintaining the security of your Google account.</li>
          <li>You agree not to misuse the app or attempt to access other users' data.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">4. No financial advice</h2>
        <p>VibeWallet displays spending data for informational purposes only. Nothing in the app constitutes financial advice. Always consult a qualified financial advisor for financial decisions.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">5. Accuracy of data</h2>
        <p>Transaction data is parsed from email text using automated methods. We do not guarantee 100% accuracy of parsed amounts, dates, or merchant names. Always verify important figures with your bank directly.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">6. Service availability</h2>
        <p>We provide VibeWallet "as is" without any guarantee of uptime, availability, or continuity. We may modify or discontinue the service at any time without notice.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">7. Limitation of liability</h2>
        <p>VibeWallet is not liable for any financial loss, data loss, or damages arising from use of this app. Use it at your own discretion.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">8. Changes to terms</h2>
        <p>We may update these terms from time to time. Continued use of the app after changes means you accept the new terms.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold text-base mb-2">9. Contact</h2>
        <p>Questions about these terms? Reach us at: <strong>kushucon@gmail.com</strong></p>
      </section>
    </main>
  );
}