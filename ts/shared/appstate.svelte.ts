import { fromArray, StoreList } from "./list.js";
import { CompState } from "./types.js";

type CSRResponse = {
    Entries: ResponseEntry[];
    ErrPage: ResponseEntry;
};

type ResponseEntry = {
    File: string;
    Props: Record<string, any>;
    CSS: string[];
};

type HrefState = {
    components: Promise<CompState[]>;
    location: string | undefined;
};

class AppState {
    #url = $state(new URL("https://example.com"));
    #node = $state<StoreList<CompState>>(null);

    hrefMap: Record<string, HrefState> = {};
    /**
     * Updates node tree state
     * @param url URL to update
     * @returns If a redirect occurs, it returns the new location
     */
    update: (url: string | URL) => Promise<string | undefined> = async () => undefined;

    get url() {
        return this.#url;
    }

    get node() {
        return this.#node;
    }

    get currentNode() {
        let node = this.#node;

        while (node?.next) {
            node = node.next;
        }

        return node;
    }

    initState(url: string, nodes: CompState[]) {
        this.#url = new URL(url);

        this.#node = fromArray(nodes);

        if (import.meta.env.SSR) {
            return;
        }

        this.hrefMap = {
            [url]: { components: new Promise((r) => r(nodes)), location: undefined },
        };

        this.update = async (url: string | URL) => {
            let newLocation: string | undefined = undefined;

            let array: CompState[];

            const href = typeof url === "string" ? url : url.href;

            if (href in this.hrefMap) {
                const { location: hrefLocation, components } = this.hrefMap[href];
                newLocation = hrefLocation;
                this.#url = new URL(newLocation ?? href);
                array = await components;
            } else {
                const { location: loadedLocation, components } = await load(href);
                newLocation = loadedLocation;
                this.#url = new URL(newLocation ?? href);
                array = await components;
            }

            // this loop replaces the first differentiated node from after onto before
            // the reason this is done instead of simply replacing the first node is so we don't rerender unnecessary nodes
            // this allows for data persistence in already rendered nodes
            let after = fromArray(array);

            let current = state.node;
            let previous: StoreList<CompState> = null;

            while (current) {
                const bcomp = current.content.comp;
                const acomp = after?.content.comp;

                if (bcomp === acomp) {
                    // Nodes are the same component - compare props
                    const bprops = current.content.props;
                    const aprops = after?.content.props;

                    if (JSON.stringify(bprops) === JSON.stringify(aprops)) {
                        // Nodes have the same props - move to the next node
                        previous = current;
                        current = current.next;
                        after = after!.next; // Safe to use ! because we know `after` is not null here
                        continue;
                    }
                }

                // Nodes are different components or have different props - update the linked list
                if (previous) {
                    // If `previous` exists, update its `next` pointer to point to `after`
                    previous.next = after;
                } else {
                    // If `previous` is null, update the head of the linked list (`state.node`)
                    this.#node = after;
                }

                break;
            }

            // If the loop ended without finding a difference, append the remaining `after` nodes
            if (!current && previous) {
                previous.next = after;
            }

            return newLocation;
        };
    }

    updateCurrentNode(newNode: CompState) {
        const lastNode = this.currentNode;

        if (!lastNode) {
            // If the list is empty, initialize it with the new node
            this.#node = { content: newNode, next: null };
            return;
        }

        // Update the last node's content
        lastNode.content = newNode;
    }
}

export const state = new AppState();

export async function load(href: string): Promise<HrefState> {
    const headers = { Golte: "true" };
    const resp = await fetch(href, { headers });
    const json: CSRResponse = await resp.json();

    for (const entry of [...json.Entries, json.ErrPage]) {
        // load css
        for (const css of entry.CSS) {
            if (document.querySelector(`link[href="${css}"][rel="stylesheet"]`)) continue;
            const link = document.createElement("link");
            link.href = css;
            link.rel = "stylesheet";
            document.head.appendChild(link);
        }
        // TODO send css as its own field, outside of the array
    }

    const promises = json.Entries.map(async (entry) => ({
        comp: (await import(entry.File)).default,
        props: entry.Props,
        errPage: (await import(json.ErrPage.File)).default,
    }));

    return {
        components: Promise.all(promises),
        location: resp.redirected ? resp.url : undefined,
    };
}
