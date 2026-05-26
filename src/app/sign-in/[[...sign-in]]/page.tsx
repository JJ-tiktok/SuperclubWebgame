import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07120d] px-4 py-10">
      <SignIn forceRedirectUrl="/lobby" fallbackRedirectUrl="/lobby" path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </main>
  );
}
