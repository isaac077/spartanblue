self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existingClient = windowClients.find((client) =>
          client.url.startsWith(self.location.origin),
        );
        if (existingClient) {
          existingClient.navigate(destination);
          return existingClient.focus();
        }
        return clients.openWindow(destination);
      }),
  );
});
