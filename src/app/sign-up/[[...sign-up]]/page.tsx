import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07120d] px-4 py-10">
      <SignUp forceRedirectUrl="/lobby" fallbackRedirectUrl="/lobby" path="/sign-up" routing="path" signInUrl="/sign-in" />
    </main>
  );
}
