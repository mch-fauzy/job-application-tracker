'use client';

import { useForm } from 'react-hook-form';
import { Loader2Icon } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { updateApplicationSchema } from '../dtos/v1/requests/update-application';
import type { ApplicationResponse } from '../dtos/v1/responses/application';
import { useUpdateApplication } from '../hooks/use-application-mutations';

interface EditApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: ApplicationResponse;
}

// Edit dialog shell. The form lives in a child rendered inside DialogContent, which Radix unmounts
// on close - so each open remounts the form with fresh defaultValues from the current application.
// The mount lifecycle is the reset, so no reset effect is needed (no-effect-for-reset rule).
export function EditApplicationDialog({ open, onOpenChange, application }: EditApplicationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Application</DialogTitle>
        </DialogHeader>
        <EditApplicationForm application={application} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface EditApplicationFormProps {
  application: ApplicationResponse;
  onClose: () => void;
}

// Mounted only while the dialog is open, so useForm seeds from the current application on each open.
// A cleared optional field normalizes to null so the server clears it, and an empty value never
// trips z.url().
function EditApplicationForm({ application, onClose }: EditApplicationFormProps) {
  const updateApplication = useUpdateApplication();

  const form = useForm({
    resolver: zodResolver(updateApplicationSchema),
    defaultValues: {
      company: application.company,
      role: application.role,
      jobUrl: application.jobUrl,
      notes: application.notes,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    updateApplication.mutate({ id: application.id, data: values }, { onSuccess: onClose });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField
          control={form.control}
          name="company"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="company">
                Company <span aria-hidden="true" className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input id="company" placeholder="Acme Corp…" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="role">
                Role <span aria-hidden="true" className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input id="role" placeholder="Senior Engineer…" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="jobUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="jobUrl">Job URL</FormLabel>
              <FormControl>
                <Input
                  id="jobUrl"
                  type="url"
                  placeholder="https://…"
                  autoComplete="off"
                  spellCheck={false}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="notes">Notes</FormLabel>
              <FormControl>
                <Textarea
                  id="notes"
                  placeholder="Any notes…"
                  autoComplete="off"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-2">
          {/* Cancel stays enabled during a pending submit so the user always has an escape from a
              slow or stuck request (NN/g user control and freedom). Save commits, Cancel just
              dismisses - a committed edit still settles and invalidation reconciles. */}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateApplication.isPending}>
            {updateApplication.isPending ? (
              <>
                <Loader2Icon className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
