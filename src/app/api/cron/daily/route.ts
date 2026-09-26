import { db } from "@/lib/db";
import { purgeDeletedPeople } from "@/lib/people";

// Vercel Cron (daily on Hobby) calls this with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const purgedPeople = await purgeDeletedPeople(db);
  const expiredInvitations = await db.invitation.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
  return Response.json({ purgedPeople, deletedInvitations: expiredInvitations.count });
}
