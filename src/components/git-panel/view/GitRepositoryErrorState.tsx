import { GitBranch, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type GitRepositoryErrorStateProps = {
  error: string;
  details?: string;
  /** When true, the project directory has no repository and `git init` can fix it. */
  canInitRepository?: boolean;
  isInitializingRepository?: boolean;
  /** Failure from the last `git init` attempt, shown below the action. */
  initError?: string | null;
  onInitRepository?: () => void;
};

// Translate known error messages; fall back to raw string for dynamic errors.
const KNOWN_ERRORS: Record<string, string> = {
  'Git operation failed': 'git.error.failed',
  'Not a git repository. This directory does not contain a .git folder. Initialize a git repository with "git init" to use source control features.': 'git.error.notGitRepo',
};

// Also translate known detail messages
const KNOWN_DETAILS: Record<string, string> = {
  'Not a git repository. This directory does not contain a .git folder. Initialize a git repository with "git init" to use source control features.': 'git.error.notGitRepo',
};

export default function GitRepositoryErrorState({
  error,
  details,
  canInitRepository = false,
  isInitializingRepository = false,
  initError,
  onInitRepository,
}: GitRepositoryErrorStateProps) {
  const { t } = useTranslation('common');
  const showInitAction = canInitRepository && Boolean(onInitRepository);
  const errorKey = KNOWN_ERRORS[error];
  const translatedDetails = useMemo(() => {
    if (!details) return null;
    const detailKey = KNOWN_DETAILS[details];
    if (detailKey) return t(detailKey);
    if (details.startsWith('Failed to get git status: ')) {
      const message = details.replace(/^Failed to get git status: /, '');
      return t('git.details.failedStatus', 'Failed to get git status: {{message}}', { message });
    }
    return details;
  }, [details, t]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-muted-foreground">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
        <GitBranch className="h-8 w-8 opacity-40" />
      </div>
      {showInitAction ? (
        <>
          <h3 className="mb-3 text-center text-lg font-medium text-foreground">
            {errorKey ? t(errorKey, error) : error}
          </h3>
          {translatedDetails && (
            <p className="mb-6 max-w-md text-center text-sm leading-relaxed">{translatedDetails}</p>
          )}
          <button
            onClick={onInitRepository}
            disabled={isInitializingRepository}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isInitializingRepository ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Initializing repository...
              </>
            ) : (
              <>
                <GitBranch className="h-4 w-4" />
                Run git init
              </>
            )}
          </button>
          {initError && (
            <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-destructive">
              {initError}
            </p>
          )}
        </>
      ) : (
        <>
          <h3 className="mb-3 text-center text-lg font-medium text-foreground">
            {errorKey ? t(errorKey, error) : error}
          </h3>
          {translatedDetails && (
            <p className="mb-6 max-w-md text-center text-sm leading-relaxed">{translatedDetails}</p>
          )}
          <div className="max-w-md rounded-xl border border-primary/10 bg-primary/5 p-4">
            <p className="text-center text-sm text-primary">
              <strong>{t('git.tip', 'Tip')}:</strong> {t('git.runGitInit', 'Run')}{' '}
              <code className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs">git init</code>{' '}
              {t('git.inProjectDir', 'in your project directory to initialize git source control.')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
