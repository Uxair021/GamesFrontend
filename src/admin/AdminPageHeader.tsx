import { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
