import { ActionResult, type SubmitFunction } from "@sveltejs/kit";
import { state } from "../../shared/appstate.svelte.js";
import { goto, invalidateAll } from "../index.js";

type FormSubmitter = HTMLButtonElement | HTMLInputElement;

function clone<T extends HTMLElement>(element: T): T {
    return element.cloneNode() as T;
}

export function deserialize(result: string) {
    const parsed = JSON.parse(result);

    if (parsed.data) {
        parsed.data = JSON.parse(parsed.data);
    }

    return parsed;
}

export async function applyAction(result: ActionResult) {
    if (import.meta.env.SSR) {
        throw new Error("Cannot call applyAction(...) on the server");
    }

    switch (result.type) {
        case "redirect":
            await goto(result.location);
            break;
        case "error": {
            const currentNode = state.currentNode;

            if (currentNode) {
                state.updateCurrentNode({
                    comp: currentNode.content.errPage,
                    errPage: currentNode.content.errPage,
                    props: {
                        status: 500,
                        message: result.error.message,
                    },
                });
            }

            break;
        }
        case "success":
        case "failure": {
            const currentNode = state.currentNode;

            if (currentNode) {
                currentNode.content.props = {
                    ...currentNode.content.props,
                    form: result.data,
                    status: result.status,
                };
            }
        }
    }
}

export const enhance = (formElement: HTMLFormElement, submit: SubmitFunction = () => {}) => {
    if (import.meta.env.DEV && clone(formElement).method !== "post") {
        throw new Error('use:enhance can only be used on <form> fields with method="POST"');
    }

    /**
     * @param {{
     *   action: URL;
     *   invalidateAll?: boolean;
     *   result: import('@sveltejs/kit').ActionResult;
     *   reset?: boolean
     * }} opts
     */
    const fallbackCallback = async ({
        action,
        result,
        reset = true,
        invalidateAll: shouldInvalidateAll = true,
    }: {
        action: URL;
        invalidateAll?: boolean;
        result: ActionResult;
        reset?: boolean;
    }) => {
        if (result.type === "success") {
            if (reset) {
                // We call reset from the prototype to avoid DOM clobbering
                HTMLFormElement.prototype.reset.call(formElement);
            }

            if (shouldInvalidateAll) {
                await invalidateAll();
            }
        }

        // For success/failure results, only apply action if it belongs to the
        // current page, otherwise `form` will be updated erroneously
        if (
            location.origin + location.pathname === action.origin + action.pathname ||
            result.type === "redirect" ||
            result.type === "error"
        ) {
            await applyAction(result);
        }
    };

    async function handleSubmit(event: SubmitEvent) {
        const method = event.submitter?.hasAttribute("formmethod")
            ? (event.submitter as FormSubmitter).formMethod
            : clone(formElement).method;

        if (method !== "post") {
            return;
        }

        event.preventDefault();

        const action = new URL(
            // We can't do submitter.formAction directly because that property is always set
            event.submitter?.hasAttribute("formaction")
                ? (event.submitter as FormSubmitter).formAction
                : clone(formElement).action
        );

        const enctype = event.submitter?.hasAttribute("formenctype")
            ? (event.submitter as FormSubmitter).formEnctype
            : clone(formElement).enctype;

        const formData = new FormData(formElement);

        if (import.meta.env.DEV && enctype !== "multipart/form-data") {
            for (const value of formData.values()) {
                if (value instanceof File) {
                    throw new Error(
                        'Your form contains <input type="file"> fields, but is missing the necessary `enctype="multipart/form-data"` attribute. This will lead to inconsistent behavior between enhanced and native forms. For more details, see https://github.com/sveltejs/kit/issues/9819.'
                    );
                }
            }
        }

        const submitterName = event.submitter?.getAttribute("name");

        if (submitterName) {
            formData.append(submitterName, event.submitter?.getAttribute("value") ?? "");
        }

        const controller = new AbortController();

        let cancelled = false;

        const cancel = () => (cancelled = true);

        const callback =
            (await submit({
                action,
                cancel,
                controller,
                formData,
                formElement,
                submitter: event.submitter,
            })) ?? fallbackCallback;

        if (cancelled) {
            return;
        }

        let result: ActionResult;

        try {
            const headers = new Headers({
                accept: "application/json",
                Golte: "true",
            });

            // do not explicitly set the `Content-Type` header when sending `FormData`
            // or else it will interfere with the browser's header setting
            // see https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects#sect4
            if (enctype !== "multipart/form-data") {
                headers.set(
                    "Content-Type",
                    /^(:?application\/x-www-form-urlencoded|text\/plain)$/.test(enctype)
                        ? enctype
                        : "application/x-www-form-urlencoded"
                );
            }

            // @ts-expect-error `URLSearchParams(formData)` is kosher, but typescript doesn't know that
            const body = enctype === "multipart/form-data" ? formData : new URLSearchParams(formData);

            const response = await fetch(action, {
                method: "POST",
                headers,
                cache: "no-store",
                body,
                signal: controller.signal,
            });

            result = deserialize(await response.text());
            if (result.type === "error") result.status = response.status;
        } catch (error) {
            if ((error as any)?.name === "AbortError") {
                return;
            }

            result = { type: "error", error };
        }

        await callback({
            action,
            formData,
            formElement,
            update: (opts) =>
                fallbackCallback({
                    action,
                    result,
                    reset: opts?.reset,
                    invalidateAll: opts?.invalidateAll,
                }),
            result,
        });
    }

    formElement.addEventListener("submit", handleSubmit);

    return {
        destroy() {
            formElement.removeEventListener("submit", handleSubmit);
        },
    };
};
