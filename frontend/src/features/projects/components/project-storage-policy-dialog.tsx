import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type ProjectStoragePolicy,
  useProjectStoragePolicy,
  useUpdateProjectStoragePolicy,
} from '../data/project-storage-policy';

type Mode = 'inherit' | 'enabled' | 'disabled';

type ProjectStoragePolicyDialogProps = {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const toMode = (value: boolean | null | undefined): Mode => {
  if (value == null) return 'inherit';
  return value ? 'enabled' : 'disabled';
};

const fromMode = (mode: Mode): boolean | null => {
  if (mode === 'inherit') return null;
  return mode === 'enabled';
};

export function ProjectStoragePolicyDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: ProjectStoragePolicyDialogProps) {
  const { t } = useTranslation();
  const policyQuery = useProjectStoragePolicy(projectId, open);
  const updatePolicy = useUpdateProjectStoragePolicy(projectId);
  const [requestMode, setRequestMode] = useState<Mode>('inherit');
  const [responseMode, setResponseMode] = useState<Mode>('inherit');
  const [chunksMode, setChunksMode] = useState<Mode>('inherit');

  useEffect(() => {
    if (!open || !policyQuery.data) return;
    setRequestMode(toMode(policyQuery.data.configured?.storeRequestBody));
    setResponseMode(toMode(policyQuery.data.configured?.storeResponseBody));
    setChunksMode(toMode(policyQuery.data.configured?.storeChunks));
  }, [open, policyQuery.data]);

  const handleSave = async () => {
    const policy: ProjectStoragePolicy = {
      storeRequestBody: fromMode(requestMode),
      storeResponseBody: fromMode(responseMode),
      storeChunks: fromMode(chunksMode),
    };

    try {
      await updatePolicy.mutateAsync(policy);
      toast.success(t('projects.storagePolicy.messages.updateSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('projects.storagePolicy.errors.updateFailed'));
    }
  };

  const renderPolicyRow = (
    label: string,
    mode: Mode,
    setMode: (mode: Mode) => void,
    globalEnabled?: boolean,
    effectiveEnabled?: boolean
  ) => (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-center justify-between gap-4'>
        <Label>{label}</Label>
        <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <SelectTrigger className='w-[190px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='inherit'>{t('projects.storagePolicy.mode.inherit')}</SelectItem>
            <SelectItem value='enabled'>{t('projects.storagePolicy.mode.enabled')}</SelectItem>
            <SelectItem value='disabled'>{t('projects.storagePolicy.mode.disabled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className='text-xs text-muted-foreground'>
        {t('projects.storagePolicy.effective', {
          system: globalEnabled ? t('projects.storagePolicy.on') : t('projects.storagePolicy.off'),
          effective: effectiveEnabled ? t('projects.storagePolicy.on') : t('projects.storagePolicy.off'),
        })}
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('projects.storagePolicy.title')}</DialogTitle>
          <DialogDescription>
            {t('projects.storagePolicy.description', { project: projectName })}
          </DialogDescription>
        </DialogHeader>

        {policyQuery.isLoading ? (
          <div className='py-8 text-center text-sm text-muted-foreground'>
            {t('common.loading')}
          </div>
        ) : policyQuery.isError || !policyQuery.data ? (
          <div className='py-8 text-center text-sm text-destructive'>
            {t('projects.storagePolicy.errors.loadFailed')}
          </div>
        ) : (
          <div className='space-y-3'>
            {renderPolicyRow(
              t('projects.storagePolicy.requestBody'),
              requestMode,
              setRequestMode,
              policyQuery.data.global.store_request_body,
              requestMode === 'disabled' ? false : policyQuery.data.global.store_request_body
            )}
            {renderPolicyRow(
              t('projects.storagePolicy.responseBody'),
              responseMode,
              setResponseMode,
              policyQuery.data.global.store_response_body,
              responseMode === 'disabled' ? false : policyQuery.data.global.store_response_body
            )}
            {renderPolicyRow(
              t('projects.storagePolicy.chunks'),
              chunksMode,
              setChunksMode,
              policyQuery.data.global.store_chunks,
              chunksMode === 'disabled' ? false : policyQuery.data.global.store_chunks
            )}
            <p className='text-xs text-muted-foreground'>
              {t('projects.storagePolicy.restrictiveOnly')}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('common.buttons.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={policyQuery.isLoading || policyQuery.isError || updatePolicy.isPending}
          >
            {updatePolicy.isPending ? t('common.buttons.saving') : t('common.buttons.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
