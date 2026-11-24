import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export type SettingsService = {
  id: string;
  title: string;
  links: { href: string; title: string; description: string; detail?: string; module?: string; icon: LucideIcon }[];
};

export function SettingsDirectory({ services }: { services: SettingsService[] }) {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 min-[880px]:grid-cols-2">
        {services.map((service) => (
          <Card key={service.id} id={service.id} className="scroll-mt-24" aria-labelledby={`${service.id}-title`}>
            <CardHeader><CardTitle id={`${service.id}-title`}>{service.title}</CardTitle></CardHeader>
            <ul className="divide-y divide-edge px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
              {service.links.map(({ href, title, description, detail, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="group flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
                      {detail && <span className="mt-1 block text-xs font-medium text-primary">{detail}</span>}
                    </span>
                    <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
