"use client";

import { AlertDialog, Button, useOverlayState } from "@heroui/react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type DialogStatus = "default" | "accent" | "success" | "warning" | "danger";

interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  status?: DialogStatus;
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(
  null,
);

const DEFAULT_OPTIONS: Required<
  Omit<ConfirmDialogOptions, "title" | "description">
> = {
  confirmText: "确认",
  cancelText: "取消",
  status: "danger",
};

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const overlay = useOverlayState();
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const closeWithResult = useCallback(
    (result: boolean) => {
      resolverRef.current?.(result);
      resolverRef.current = null;
      setOptions(null);
      overlay.close();
    },
    [overlay],
  );

  const confirm = useCallback(
    (nextOptions: ConfirmDialogOptions) => {
      setOptions(nextOptions);
      overlay.open();

      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [overlay],
  );

  const contextValue = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}

      <AlertDialog.Backdrop
        isOpen={overlay.isOpen && Boolean(options)}
        onOpenChange={(isOpen) => {
          overlay.setOpen(isOpen);
          if (!isOpen && resolverRef.current) {
            closeWithResult(false);
          }
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            {options ? (
              <>
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Icon
                    status={options.status ?? DEFAULT_OPTIONS.status}
                  />
                  <AlertDialog.Heading>{options.title}</AlertDialog.Heading>
                </AlertDialog.Header>

                {options.description ? (
                  <AlertDialog.Body>
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {options.description}
                    </p>
                  </AlertDialog.Body>
                ) : null}

                <AlertDialog.Footer className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="tertiary"
                    onPress={() => closeWithResult(false)}
                  >
                    {options.cancelText ?? DEFAULT_OPTIONS.cancelText}
                  </Button>
                  <Button
                    variant={
                      (options.status ?? DEFAULT_OPTIONS.status) === "danger"
                        ? "danger"
                        : "primary"
                    }
                    onPress={() => closeWithResult(true)}
                  >
                    {options.confirmText ?? DEFAULT_OPTIONS.confirmText}
                  </Button>
                </AlertDialog.Footer>
              </>
            ) : null}
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error(
      "useConfirmDialog must be used within ConfirmDialogProvider.",
    );
  }

  return context;
}
