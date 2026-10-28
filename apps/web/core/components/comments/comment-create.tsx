/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { BaseSyntheticEvent } from "react";
import { observer } from "mobx-react";
import { useForm, Controller } from "react-hook-form";
// plane imports
import { EIssueCommentAccessSpecifier } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import type { TIssueComment, TCommentsOperations } from "@plane/types";
import { cn, isCommentEmpty, getEditorAssetDownloadSrc } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { FileService } from "@/services/file.service";
import { useFileSize } from "@/hooks/use-file-size";
import { commentFileLink } from "@/app/lib/izclick/comment-file-link";

type TCommentCreate = {
  entityId: string;
  workspaceSlug: string;
  activityOperations: TCommentsOperations;
  showToolbarInitially?: boolean;
  compact?: boolean;
  projectId?: string;
  onSubmitCallback?: (elementId: string) => void;
};

// services
const fileService = new FileService();

export const CommentCreate = observer(function CommentCreate(props: TCommentCreate) {
  const {
    workspaceSlug,
    entityId,
    activityOperations,
    showToolbarInitially = false,
    compact = false,
    projectId,
    onSubmitCallback,
  } = props;
  // states
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const { maxFileSize } = useFileSize();
  // refs
  const uploadedAssetIdsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingFileRef = useRef(false);
  const editorRef = useRef<EditorRefApi>(null);
  const submittingRef = useRef(false);
  const submitLatestRef = useRef<(event?: BaseSyntheticEvent) => void>(() => {});
  // store hooks
  const workspaceStore = useWorkspace();
  // derived values
  const workspaceId = workspaceStore.getWorkspaceBySlug(workspaceSlug)?.id as string;
  // form info
  const {
    handleSubmit,
    getValues,
    control,
    watch,
    formState: { isSubmitting },
    reset,
  } = useForm<Partial<TIssueComment>>({
    defaultValues: {
      comment_html: "<p></p>",
    },
  });

  const onSubmit = async (formData: Partial<TIssueComment>) => {
    let submitted = false;
    const uploadedAssetIds = uploadedAssetIdsRef.current.slice();
    try {
      const comment = await activityOperations.createComment(formData);
      submitted = Boolean(comment?.id);
      if (comment?.id) onSubmitCallback?.(comment.id);
      if (comment?.id && uploadedAssetIds.length > 0) {
        if (projectId) {
          await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId.toString(), comment.id, {
            asset_ids: uploadedAssetIds,
          });
        } else {
          await fileService.updateBulkWorkspaceAssetsUploadStatus(workspaceSlug, comment.id, {
            asset_ids: uploadedAssetIds,
          });
        }
        const associated = new Set(uploadedAssetIds);
        uploadedAssetIdsRef.current = uploadedAssetIdsRef.current.filter(id => !associated.has(id));
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (!compact || submitted) {
        reset({ comment_html: "<p></p>" });
        editorRef.current?.clearEditor();
      }
    }
  };

  const attachFiles = async (files: File[]) => {
    if (uploadingFileRef.current || submittingRef.current || files.length === 0) return;
    if (files.some(file => file.size > maxFileSize)) {
      setFileError(`Cada archivo debe pesar como máximo ${Math.round(maxFileSize / 1024 / 1024)} MB.`);
      return;
    }
    uploadingFileRef.current = true;
    setUploadingFile(true); setFileError("");
    try {
      for (const file of files) {
        const { asset_id } = await activityOperations.uploadCommentAsset(crypto.randomUUID(), file);
        uploadedAssetIdsRef.current.push(asset_id);
        const url = getEditorAssetDownloadSrc({ assetId: asset_id, projectId, workspaceSlug });
        if (!url || !editorRef.current) throw new Error("El comentario no está disponible.");
        editorRef.current.insertText(commentFileLink(file.name, url), true);
      }
    } catch {
      setFileError("No se pudo adjuntar el archivo. Tu comentario se conserva; vuelve a intentarlo.");
    } finally {
      uploadingFileRef.current = false;
      setUploadingFile(false);
    }
  };

  // The editor keyboard extension retains its initial callback. Read the latest
  // submit handler through a stable ref, and lock before async form validation so
  // the editor Enter handler and its bubbling event cannot submit twice.
  useEffect(() => {
    submitLatestRef.current = (event) => {
      if (submittingRef.current || uploadingFileRef.current || isCommentEmpty(getValues("comment_html") ?? undefined) || !editorRef.current?.isEditorReadyToDiscard()) return;
      submittingRef.current = true;
      void handleSubmit(onSubmit)(event).finally(() => { submittingRef.current = false; });
    };
  });

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);

  return (
    <div
      className={cn("sticky bottom-0 z-[4] bg-surface-1 sm:static")}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
          submitLatestRef.current(event);
        }
      }}
    >
      {compact && <input ref={fileInputRef} type="file" multiple hidden
        aria-label="Seleccionar archivos para el comentario" disabled={isSubmitting || uploadingFile}
        onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void attachFiles(files); }} />}
      {uploadingFile && <p role="status" className="px-2 text-xs text-tertiary">Adjuntando archivos…</p>}
      {fileError && <p role="alert" className="px-2 text-xs text-red-500">{fileError}</p>}
      <Controller
        name="access"
        control={control}
        render={({ field: { onChange: onAccessChange, value: accessValue } }) => (
          <Controller
            name="comment_html"
            control={control}
            render={({ field: { value, onChange } }) => (
              <LiteTextEditor
                variant={compact ? "lite" : "full"}
                onAttachFile={compact ? () => fileInputRef.current?.click() : undefined}
                editable
                workspaceId={workspaceId}
                id={"add_comment_" + entityId}
                value={"<p></p>"}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                onEnterKeyPress={(event) => submitLatestRef.current(event)}
                ref={editorRef}
                initialValue={value ?? "<p></p>"}
                containerClassName="min-h-min"
                onChange={(comment_json, comment_html) => onChange(comment_html)}
                accessSpecifier={accessValue ?? EIssueCommentAccessSpecifier.INTERNAL}
                handleAccessChange={onAccessChange}
                isSubmitting={isSubmitting || uploadingFile}
                uploadFile={async (blockId, file) => {
                  const { asset_id } = await activityOperations.uploadCommentAsset(blockId, file);
                  uploadedAssetIdsRef.current.push(asset_id);
                  return asset_id;
                }}
                duplicateFile={async (assetId: string) => {
                  const { asset_id } = await activityOperations.duplicateCommentAsset(assetId);
                  uploadedAssetIdsRef.current.push(asset_id);
                  return asset_id;
                }}
                showToolbarInitially={showToolbarInitially}
                parentClassName="p-2"
                displayConfig={{
                  fontSize: "small-font",
                }}
              />
            )}
          />
        )}
      />
    </div>
  );
});
