<template>
  <p
    class="apos-table__cell-field"
    :class="`apos-table__cell-field--${header.name}`"
  >
    <span v-if="hasValue">
      <span v-for="index in 5" :key="index" class="rating">{{ isActive(index) ? '☆' : '★' }}</span>
    </span>
    <span v-else>
      None
    </span>
  </p>
</template>

<script>
import AposCellMixin from 'Modules/@apostrophecms/ui/mixins/AposCellMixin';

console.log('hiya');
export default {
  name: 'ColumnDateOpened',
  mixins: [ AposCellMixin ],
  computed: {
    hasValue() {
      return this.get(this.header.name) != null;
    }
  },
  methods: {
    isActive(index) {
      return index <= (this.get(this.header.name) || 0);
    }
  }
};
</script>