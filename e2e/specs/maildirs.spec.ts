/** Task 7.1 — maildir listing: every account in the manifest is shown. */
import { test, expect } from '../harness/fixtures.ts';
import { AccountsPage } from '../pages/AccountsPage.ts';
import { manifest } from '../fixtures/manifest.ts';

// openspec/specs/sveltekit-ui/spec.md: maildir listing
test('lists every account from the manifest', async ({ page }) => {
	const accounts = new AccountsPage(page);
	await accounts.open();

	const listed = await accounts.listedAddresses();
	for (const account of manifest) {
		expect(listed).toContain(account.address);
	}
	expect(listed).toHaveLength(manifest.length);
});
