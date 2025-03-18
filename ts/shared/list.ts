/** Creates a singly linked list from the given array */
export function fromArray<T>(array: T[]): StoreList<T> {
    let current: StoreList<T> = null;

    for (let i = array.length - 1; i >= 0; i--) {
        current = {
            content: array[i],
            next: current,
        };
    }

    return current;
}

export type StoreList<T> = ListNode<T> | null;

export type ListNode<T> = {
    content: T;
    next: StoreList<T>;
};
