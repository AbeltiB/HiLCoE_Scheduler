import { NextResponse } from "next/server";
import { guarded } from "@/lib/auth/guard";

export const GET = guarded(null, async ({ user }) =>
  NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    roles: user.roles,
    permissions: [...user.permissions],
    attributes: user.attributes,
  })
);
