import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/lobby(.*)",
  "/games(.*)",
  "/api(.*)",
  "/game-changer-lab(.*)",
  "/player-db-test(.*)",
  "/draft-test(.*)",
  "/draft-db-test(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", request.url);

    await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
  }
});

export const config = {
  matcher: [
    "/lobby(.*)",
    "/games(.*)",
    "/game-changer-lab(.*)",
    "/player-db-test(.*)",
    "/draft-test(.*)",
    "/draft-db-test(.*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
