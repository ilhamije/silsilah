import { describe, expect, it } from "vitest";
import { inviteEmail } from "@/lib/email/templates";

describe("inviteEmail", () => {
  const url = "https://silsilah.example/invite/abc_123";
  it("names the inviter, tree and role, and carries the link", () => {
    const m = inviteEmail(url, "Keluarga Hasan", "Sari", "EDITOR", "en");
    expect(m.subject).toContain("Keluarga Hasan");
    expect(m.text).toContain("Sari invited you");
    expect(m.text).toContain("an editor");
    expect(m.text).toContain(url);
    expect(m.html).toContain(`href="${url}"`);
  });
  it("is available in Bahasa Indonesia", () => {
    const m = inviteEmail(url, "Keluarga Hasan", "Sari", "VIEWER", "id");
    expect(m.text).toContain("mengundang Anda");
    expect(m.text).toContain("pembaca");
  });
  it("escapes names in the HTML", () => {
    const m = inviteEmail(url, `<b>"x"</b>`, "<i>Eve</i>", "VIEWER", "en");
    expect(m.html).not.toContain("<b>");
    expect(m.html).not.toContain("<i>");
  });
});
