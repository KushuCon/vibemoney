// import { AuthOptions } from "next-auth";
// import GoogleProvider from "next-auth/providers/google";
// import { supabaseAdmin } from "@/lib/supabase";

// export const authOptions: AuthOptions = {
//   providers: [
//     GoogleProvider({
//       clientId: process.env.GOOGLE_CLIENT_ID!,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
//       authorization: {
//         params: {
//           scope: [
//             "openid",
//             "email",
//             "profile",
//             "https://www.googleapis.com/auth/gmail.readonly",
//           ].join(" "),
//           access_type: "offline",
//           prompt: "consent",
//         },
//       },
//     }),
//   ],

//   callbacks: {
//     async jwt({ token, account }) {
//       if (account) {
//         token.accessToken = account.access_token;
//         token.refreshToken = account.refresh_token;
//         token.accessTokenExpires = account.expires_at
//           ? account.expires_at * 1000
//           : Date.now() + 3600 * 1000;
//       }

//       if (Date.now() < (token.accessTokenExpires as number)) {
//         return token;
//       }

//       return refreshAccessToken(token);
//     },

//     async session({ session, token }) {
//       session.accessToken = token.accessToken as string;
//       session.refreshToken = token.refreshToken as string;
//       session.error = token.error as string | undefined;
//       return session;
//     },

//     async signIn({ user, account }) {
//       if (!user.email) return false;

//       try {
//         await supabaseAdmin.from("users").upsert(
//           {
//             email: user.email,
//             name: user.name,
//             avatar_url: user.image,
//             google_id: account?.providerAccountId,
//             updated_at: new Date().toISOString(),
//           },
//           { onConflict: "email" }
//         );
//       } catch (err) {
//         console.error("Supabase upsert error:", err);
//       }

//       return true;
//     },
//   },

//   pages: {
//     signIn: "/",
//     error: "/",
//   },

//   session: {
//     strategy: "jwt",
//     maxAge: 30 * 24 * 60 * 60,
//     updateAge: 24 * 60 * 60,
//   },
// };

// async function refreshAccessToken(token: Record<string, unknown>) {
//   try {
//     const url = "https://oauth2.googleapis.com/token";
//     const response = await fetch(url, {
//       method: "POST",
//       headers: { "Content-Type": "application/x-www-form-urlencoded" },
//       body: new URLSearchParams({
//         client_id: process.env.GOOGLE_CLIENT_ID!,
//         client_secret: process.env.GOOGLE_CLIENT_SECRET!,
//         grant_type: "refresh_token",
//         refresh_token: token.refreshToken as string,
//       }),
//     });

//     const refreshed = await response.json();
//     if (!response.ok) throw refreshed;

//     return {
//       ...token,
//       accessToken: refreshed.access_token,
//       accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
//       refreshToken: refreshed.refresh_token ?? token.refreshToken,
//     };
//   } catch (error) {
//     console.error("Token refresh error:", error);
//     return { ...token, error: "RefreshAccessTokenError" };
//   }
// }


import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { supabaseAdmin } from "@/lib/supabase";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
      }

      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.error = token.error as string | undefined;
      return session;
    },

    async signIn({ user, account }) {
      if (!user.email) return false;

      try {
        await supabaseAdmin.from("users").upsert(
          {
            email: user.email,
            name: user.name,
            avatar_url: user.image,
            google_id: account?.providerAccountId,
            updated_at: new Date().toISOString(),
            // Store refresh token so background cron can sync on user's behalf
            ...(account?.refresh_token ? { refresh_token: account.refresh_token } : {}),
          },
          { onConflict: "email" }
        );
      } catch (err) {
        console.error("Supabase upsert error:", err);
      }

      return true;
    },
  },

  pages: {
    signIn: "/",
    error: "/",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
};

async function refreshAccessToken(token: Record<string, unknown>) {
  try {
    const url = "https://oauth2.googleapis.com/token";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Token refresh error:", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}