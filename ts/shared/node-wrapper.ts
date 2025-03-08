// This file is a wrapper for Node.svelte that adds functionality handling errors.
// When an error is thrown during ssr, it catches it and instead
// the specified error page is rendered instead.

import { getContext } from "svelte";
import _Node from "./Node.svelte";
import { handleError } from "./keys.js";

type Props = {
    node: any;
    index: any;
}

function ssrWrapper(internal: any, props: Props) {
    try {
        return _Node(internal, props);
    } catch (err) {
        let message = "Internal Error";
        if (import.meta.env.MODE === "development") {
            message = (err instanceof Error && err.stack) ? err.stack : String(err);
        }

        const errProps = {
            status: 500,
            message,
        };
        
        getContext<Function>(handleError)({ index: props.index, props: errProps });
        return props.node.content.errPage(internal, errProps);
    }
}

function csrWrapper(internal: any, props: Props) {
    // if there as an error during ssr, don't render anything new
    const ssrError = props.node.content.ssrError;
    // this doesn't work
    if (ssrError) return props.node.content.errPage(internal, ssrError);

    return _Node(internal, props);
};

export const Node = (internal: any, props: Props) => {
    if (import.meta.env.SSR) {
        return ssrWrapper(internal, props);
    } else {
        return csrWrapper(internal, props) 
    }
};