'use client';

import { Badge } from '@/shared/components/ui/badge';
import { FormattedDate } from '@/shared/components/app/formatted-date';
import { toSafeHttpUrl } from '@/shared/utils/safe-url/safe-url';
import { useApplication } from '@/features/application/hooks/use-application';
import { ApplicationDetailActions } from './application-detail-actions';

interface ApplicationDetailProps {
  id: string;
}

export function ApplicationDetail({ id }: ApplicationDetailProps) {
  const { data, isLoading, isError } = useApplication(id);

  if (isLoading) {
    return (
      <p role="status" aria-busy="true" className="text-sm text-muted-foreground">
        Loading application…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load application.
      </p>
    );
  }

  const safeJobUrl = data.jobUrl ? toSafeHttpUrl(data.jobUrl) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold break-words">{data.role}</h1>
        <p className="text-lg text-muted-foreground break-words">{data.company}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="capitalize">
          {data.status}
        </Badge>
        <ApplicationDetailActions application={data} />
      </div>

      {safeJobUrl ? (
        <p className="text-sm">
          <span className="font-medium">Job URL: </span>
          <a
            href={safeJobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary hover:underline"
          >
            {safeJobUrl}
          </a>
        </p>
      ) : null}

      {data.notes ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Notes</p>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{data.notes}</p>
        </div>
      ) : null}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>Created: <FormattedDate value={data.createdAt} /></p>
        <p>Last updated: <FormattedDate value={data.updatedAt} /></p>
      </div>
    </div>
  );
}
