import { Link } from "@teyik0/furin/link";
import { useState } from "react";
import { client } from "../client";
import { route } from "./root";

export default route.page({
  component: () => {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.SubmitEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setMessage("");

      const { data, error } = await client.api.login.post({ email });

      if (data) {
        setMessage("Connected! Redirecting...");
        location.href = "/dashboard";
      } else {
        setMessage(error?.value?.message ?? "Login failed");
      }

      setIsLoading(false);
    };

    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link className="font-bold text-2xl text-blue-600 dark:text-blue-400" to="/">
              Furin
            </Link>
            <h1 className="mt-4 font-bold text-3xl text-foreground">Sign in to your account</h1>
            <p className="mt-2 text-muted-foreground">
              Access the admin dashboard to manage your posts
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card px-4 py-8 shadow-sm sm:px-10">
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="mb-1 block font-medium text-foreground text-sm" htmlFor="email">
                  Email address
                </label>
                <input
                  autoComplete="email"
                  className="block w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  id="email"
                  name="email"
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  placeholder="user@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>

              <div>
                <button
                  className="flex w-full justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white shadow-sm transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading ? "Signing in..." : "Sign in"}
                </button>
              </div>

              {message && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    message.includes("Connected")
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}
                >
                  {message}
                </div>
              )}
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-border border-t" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-card px-2 text-muted-foreground">Demo accounts</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50"
                  onClick={() => setEmail("user@example.com")}
                  type="button"
                >
                  <div className="flex items-center">
                    <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
                      <span className="font-medium text-blue-600 text-sm dark:text-blue-400">
                        JD
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-foreground text-sm">John Doe</p>
                      <p className="text-muted-foreground text-xs">user@example.com</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-500/15 px-2 py-1 text-blue-600 text-xs dark:text-blue-400">
                    User
                  </span>
                </button>

                <button
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50"
                  onClick={() => setEmail("admin@example.com")}
                  type="button"
                >
                  <div className="flex items-center">
                    <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
                      <span className="font-medium text-purple-600 text-sm dark:text-purple-400">
                        AU
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-foreground text-sm">Admin User</p>
                      <p className="text-muted-foreground text-xs">admin@example.com</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-purple-500/15 px-2 py-1 text-purple-600 text-xs dark:text-purple-400">
                    Admin
                  </span>
                </button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-muted-foreground text-sm">
            This is a demo. Click on any account above to auto-fill the email.
          </p>
        </div>
      </main>
    );
  },
});
