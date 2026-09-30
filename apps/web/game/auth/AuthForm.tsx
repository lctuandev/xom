"use client";

import { loginSchema, registerSchema } from "@xom/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ApiFailure, authApi } from "./api";
import { useAuth } from "./store";

type Mode = "login" | "register";
type Fields = Partial<Record<"username" | "password" | "displayName" | "_", string>>;

export function AuthForm({ next }: { next: string }) {
  const router = useRouter();
  const setAuth = useAuth((s) => s.set);
  const [mode, setMode] = useState<Mode>("register");
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const schema = mode === "login" ? loginSchema : registerSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Fields = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "_") as keyof Fields;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const auth =
        mode === "login"
          ? await authApi.login(loginSchema.parse(form))
          : await authApi.register(registerSchema.parse(form));
      setAuth(auth);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiFailure) setErrors({ ...err.fields, _: err.message });
      else setErrors({ _: "Có lỗi xảy ra" });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 rounded-2xl bg-ink/5 p-1" role="tablist">
        {(["register", "login"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErrors({});
            }}
            className="h-11 rounded-xl text-base font-semibold text-ink/60 aria-selected:bg-cream aria-selected:text-ink aria-selected:shadow-sm"
          >
            {m === "register" ? "Tạo tài khoản" : "Đăng nhập"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Tên đăng nhập"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          error={errors.username}
          hint={mode === "register" ? "Chữ không dấu, số, dấu _" : undefined}
        />
        {mode === "register" && (
          <Field
            label="Tên hiển thị trong xóm"
            name="displayName"
            autoComplete="nickname"
            error={errors.displayName}
            hint="Hiện trên biển hiệu, ví dụ: Tuấn"
          />
        )}
        <Field
          label="Mật khẩu"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          error={errors.password}
        />
        {errors._ && (
          <p role="alert" className="rounded-xl bg-red/10 px-4 py-3 text-sm font-semibold text-red">
            {errors._}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 h-12 rounded-2xl bg-red text-base font-semibold text-cream active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Đang vào…" : mode === "login" ? "Vào xóm" : "Tạo tài khoản & vào xóm"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  ...input
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className="h-12 rounded-xl border-2 border-ink/15 bg-white px-4 text-base outline-none focus:border-red aria-invalid:border-red"
        {...input}
      />
      {(error || hint) && (
        <p
          id={`${id}-note`}
          className={`text-sm ${error ? "font-semibold text-red" : "text-ink/60"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
