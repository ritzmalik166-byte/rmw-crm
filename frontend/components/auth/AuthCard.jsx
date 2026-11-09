export function AuthCard({ title, description, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-semibold">RMW CRM</span>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}
