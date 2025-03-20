<script>
    import { Node } from "./node-wrapper.js";

    /**
     * @typedef {Object}
     * @property {import("./list.js").ListNode<import("./types.js").CompState>} node
     * @property {number} index
     */
    const { node, index } = $props();
    const { next, content } = $derived(node);

    const Component = $derived(content.comp);
</script>

<Component {...content.props}>
    {#key next}
        {#if next}
            <Node node={next} index={index + 1} />
        {/if}
    {/key}
</Component>
